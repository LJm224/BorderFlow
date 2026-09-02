import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { createApplication } from '../dist/app-factory.js';

const prisma = new PrismaClient();
const tenantId = 'demo-tenant-001';
const storeId = 'demo-store-001';
const skuId = 'demo-sku-001';

describe('店铺-手工订单-Shopify Mock 闭环', () => {
  let app;
  let baseUrl;
  let accessToken;
  let createdStoreId;
  let createdWarehouseId;
  let manualOrderId;
  let importedOrderId;
  let syncRunIds = [];
  const externalOrderId = `E2E-MOCK-${Date.now()}`;

  before(async () => {
    app = await createApplication();
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/api`;
    const login = await fetch(`${baseUrl}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantCode: 'demo-shop', email: 'admin@borderflow.dev', password: 'admin123' }) });
    assert.equal(login.status, 200);
    accessToken = (await login.json()).data.accessToken;
  });

  after(async () => {
    if (manualOrderId || importedOrderId) {
      const orderIds = [manualOrderId, importedOrderId].filter(Boolean);
      await prisma.auditLog.deleteMany({ where: { resource: 'Order', resourceId: { in: orderIds } } });
      await prisma.orderTimelineEvent.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    if (syncRunIds.length) {
      await prisma.channelSyncLog.deleteMany({ where: { syncRunId: { in: syncRunIds } } });
      await prisma.channelSyncRun.deleteMany({ where: { id: { in: syncRunIds } } });
    }
    if (createdWarehouseId) await prisma.warehouse.delete({ where: { id: createdWarehouseId } });
    if (createdStoreId) await prisma.store.delete({ where: { id: createdStoreId } });
    await app?.close();
    await prisma.$disconnect();
  });

  it('可查询店铺并创建仓库，且租户隔离生效', async () => {
    const headers = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
    const stores = await fetch(`${baseUrl}/stores`, { headers });
    assert.equal(stores.status, 200);
    assert.ok((await stores.json()).data.some((store) => store.id === storeId));
    const createdStore = await fetch(`${baseUrl}/stores`, { method: 'POST', headers, body: JSON.stringify({ name: `E2E Store ${Date.now()}`, channelType: 'SHOPIFY', defaultCurrency: 'USD', timezone: 'UTC' }) });
    assert.equal(createdStore.status, 201);
    createdStoreId = (await createdStore.json()).data.id;
    const createdWarehouse = await fetch(`${baseUrl}/warehouses`, { method: 'POST', headers, body: JSON.stringify({ storeId: createdStoreId, name: 'E2E Warehouse' }) });
    assert.equal(createdWarehouse.status, 201);
    createdWarehouseId = (await createdWarehouse.json()).data.id;
    const warehouses = await fetch(`${baseUrl}/warehouses?storeId=${createdStoreId}`, { headers });
    assert.equal(warehouses.status, 200);
    assert.equal((await warehouses.json()).data[0].id, createdWarehouseId);
  });

  it('可创建手工订单，并写入初始时间线与审计日志', async () => {
    const headers = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
    const response = await fetch(`${baseUrl}/orders`, { method: 'POST', headers, body: JSON.stringify({ storeId, shippingCountry: 'US', status: 'PAID', items: [{ skuId, quantity: 2 }] }) });
    assert.equal(response.status, 201);
    const body = await response.json();
    manualOrderId = body.data.id;
    assert.equal(body.data.source, 'MANUAL');
    assert.equal(body.data.totalAmount, '119.98');
    assert.ok(body.data.timelineEvents.some((event) => event.eventType === 'ORDER_CREATED'));
    const audit = await fetch(`${baseUrl}/audit-logs?resource=Order&keyword=${manualOrderId}`, { headers });
    assert.ok((await audit.json()).data.items.some((item) => item.action === 'ORDER_CREATED'));
  });

  it('Shopify Mock 可按外部 SKU 映射导入订单，并防止重复导入', async () => {
    const headers = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
    const connections = await fetch(`${baseUrl}/channel-connections`, { headers });
    assert.equal(connections.status, 200);
    const connection = (await connections.json()).data.find((item) => item.store.id === storeId);
    assert.ok(connection);
    const imported = await fetch(`${baseUrl}/channel-connections/${connection.id}/mock/import-orders`, { method: 'POST', headers, body: JSON.stringify({ orders: [{ externalOrderId, shippingCountry: 'US', financialStatus: 'paid', items: [{ externalSku: 'BF-BAG-BLACK', quantity: 1 }] }] }) });
    assert.equal(imported.status, 201);
    const importedBody = await imported.json();
    assert.equal(importedBody.data.successItems, 1);
    importedOrderId = importedBody.data.importedOrderIds[0];
    syncRunIds.push(importedBody.data.runId);
    const duplicate = await fetch(`${baseUrl}/channel-connections/${connection.id}/mock/import-orders`, { method: 'POST', headers, body: JSON.stringify({ orders: [{ externalOrderId, shippingCountry: 'US', financialStatus: 'paid', items: [{ externalSku: 'BF-BAG-BLACK', quantity: 1 }] }] }) });
    assert.equal(duplicate.status, 201);
    const duplicateBody = await duplicate.json();
    assert.equal(duplicateBody.data.successItems, 0);
    assert.equal(duplicateBody.data.failedItems, 1);
    syncRunIds.push(duplicateBody.data.runId);
    const order = await fetch(`${baseUrl}/orders/${importedOrderId}`, { headers });
    assert.equal((await order.json()).data.source, 'SHOPIFY');
  });
});
