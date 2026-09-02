import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { createApplication } from '../dist/app-factory.js';

const prisma = new PrismaClient();
const tenantId = 'demo-tenant-001';
const storeId = 'demo-store-001';
const skuId = 'demo-sku-001';
const warehouseId = 'demo-warehouse-001';

describe('订单-库存真实 HTTP 闭环', () => {
  let app;
  let baseUrl;
  let accessToken;
  let orderId;
  let cancelOrderId;
  let productId;
  let skuIdForProduct;
  let inventoryIdForProduct;
  let inventoryId;

  before(async () => {
    const inventory = await prisma.inventory.findUnique({ where: { skuId_warehouseId: { skuId, warehouseId } }, select: { id: true } });
    assert.ok(inventory, 'E2E fixture inventory not found; run prisma seed first');
    inventoryId = inventory.id;
    await prisma.inventory.update({ where: { id: inventoryId }, data: { availableQuantity: 48, lockedQuantity: 3 } });

    app = await createApplication();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}/api`;

    const login = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenantCode: 'demo-shop', email: 'admin@borderflow.dev', password: 'admin123' }),
    });
    assert.equal(login.status, 200);
    const loginBody = await login.json();
    accessToken = loginBody.data.accessToken;

    const order = await prisma.order.create({
      data: {
        tenantId,
        storeId,
        orderNo: `BF-E2E-${Date.now()}`,
        market: 'US',
        currency: 'USD',
        totalAmount: 59.99,
        status: 'PAID',
        shippingCountry: 'US',
        items: { create: [{ skuId, quantity: 1, unitPrice: 59.99 }] },
      },
    });
    orderId = order.id;
    const cancelOrder = await prisma.order.create({
      data: {
        tenantId,
        storeId,
        orderNo: `BF-E2E-CANCEL-${Date.now()}`,
        market: 'US',
        currency: 'USD',
        totalAmount: 119.98,
        status: 'PAID',
        shippingCountry: 'US',
        items: { create: [{ skuId, quantity: 2, unitPrice: 59.99 }] },
      },
    });
    cancelOrderId = cancelOrder.id;
  });

  after(async () => {
    if (orderId) {
      await prisma.auditLog.deleteMany({ where: { resource: { in: ['Order', 'Inventory'] }, OR: [{ resourceId: orderId }, { metadata: { path: ['orderId'], equals: orderId } }] } });
      await prisma.inventoryAllocation.deleteMany({ where: { orderId } });
      await prisma.inventoryTransaction.deleteMany({ where: { referenceId: orderId } });
      await prisma.orderTimelineEvent.deleteMany({ where: { orderId } });
      await prisma.orderItem.deleteMany({ where: { orderId } });
      await prisma.order.delete({ where: { id: orderId } });
      await prisma.inventory.update({ where: { id: inventoryId }, data: { availableQuantity: 48, lockedQuantity: 3 } });
    }
    if (cancelOrderId) {
      await prisma.inventoryAllocation.deleteMany({ where: { orderId: cancelOrderId } });
      await prisma.inventoryTransaction.deleteMany({ where: { referenceId: cancelOrderId } });
      await prisma.orderTimelineEvent.deleteMany({ where: { orderId: cancelOrderId } });
      await prisma.orderItem.deleteMany({ where: { orderId: cancelOrderId } });
      await prisma.order.delete({ where: { id: cancelOrderId } });
    }
    if (productId) {
      await prisma.auditLog.deleteMany({ where: { resource: 'Product', resourceId: productId } });
      if (inventoryIdForProduct) {
        await prisma.auditLog.deleteMany({ where: { resource: 'Inventory', resourceId: inventoryIdForProduct } });
        await prisma.inventoryTransaction.deleteMany({ where: { inventoryId: inventoryIdForProduct } });
        await prisma.inventory.delete({ where: { id: inventoryIdForProduct } });
      }
      if (skuIdForProduct) await prisma.sku.delete({ where: { id: skuIdForProduct } });
      await prisma.product.delete({ where: { id: productId } });
    }
    await app?.close();
    await prisma.$disconnect();
  });

  it('拣货锁库存、发货扣锁定库存，并产生审计记录', async () => {
    const headers = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
    const picking = await fetch(`${baseUrl}/orders/${orderId}/status`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'PICKING', note: 'E2E 开始拣货' }) });
    assert.equal(picking.status, 200);
    assert.equal((await picking.json()).data.status, 'PICKING');

    const afterReserve = await fetch(`${baseUrl}/inventory/${inventoryId}`, { headers });
    assert.equal(afterReserve.status, 200);
    const reserved = (await afterReserve.json()).data;
    assert.equal(reserved.availableQuantity, 47);
    assert.equal(reserved.lockedQuantity, 4);

    const orderDetail = await fetch(`${baseUrl}/orders/${orderId}`, { headers });
    assert.equal(orderDetail.status, 200);
    assert.equal((await orderDetail.json()).data.items[0].inventoryAllocations[0].quantity, 1);

    const shipped = await fetch(`${baseUrl}/orders/${orderId}/status`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'SHIPPED', note: 'E2E 完成发货' }) });
    assert.equal(shipped.status, 200);
    assert.equal((await shipped.json()).data.status, 'SHIPPED');

    const afterShip = await fetch(`${baseUrl}/inventory/${inventoryId}`, { headers });
    const fulfilled = (await afterShip.json()).data;
    assert.equal(fulfilled.availableQuantity, 47);
    assert.equal(fulfilled.lockedQuantity, 3);

    const audit = await fetch(`${baseUrl}/audit-logs?resource=Order&keyword=${orderId}`, { headers });
    assert.equal(audit.status, 200);
    const auditBody = await audit.json();
    assert.ok(auditBody.data.items.some((item) => item.action === 'ORDER_STATUS_CHANGED'));
  });

  it('取消拣货中的订单会释放已锁定库存', async () => {
    const headers = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
    const picking = await fetch(`${baseUrl}/orders/${cancelOrderId}/status`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'PICKING', note: 'E2E 测试取消' }) });
    assert.equal(picking.status, 200);
    const reserved = await fetch(`${baseUrl}/inventory/${inventoryId}`, { headers });
    assert.equal((await reserved.json()).data.lockedQuantity, 5);
    const cancelled = await fetch(`${baseUrl}/orders/${cancelOrderId}/status`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'CANCELLED', note: 'E2E 释放库存' }) });
    assert.equal(cancelled.status, 200);
    const released = await fetch(`${baseUrl}/inventory/${inventoryId}`, { headers });
    const releasedBody = await released.json();
    assert.equal(releasedBody.data.availableQuantity, 47);
    assert.equal(releasedBody.data.lockedQuantity, 3);
  });

  it('商品可以保存、提交审核、发布，并记录商品审计日志', async () => {
    const headers = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
    const skuCode = `BF-E2E-SKU-${Date.now()}`;
    const created = await fetch(`${baseUrl}/products`, { method: 'POST', headers, body: JSON.stringify({ name: `E2E Product ${Date.now()}`, description: 'E2E 商品', market: 'US', currency: 'USD', skus: [{ skuCode, variantName: 'Default', price: 20, costPrice: 8, weight: 0.2 }] }) });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    productId = createdBody.data.id;
    skuIdForProduct = createdBody.data.skus[0].id;

    const updated = await fetch(`${baseUrl}/products/${productId}`, { method: 'PATCH', headers, body: JSON.stringify({ description: 'E2E 商品已编辑' }) });
    assert.equal(updated.status, 200);
    const review = await fetch(`${baseUrl}/products/${productId}/status`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'PENDING_REVIEW' }) });
    assert.equal(review.status, 200);
    assert.equal((await review.json()).data.status, 'PENDING_REVIEW');
    const published = await fetch(`${baseUrl}/products/${productId}/status`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'PUBLISHED' }) });
    assert.equal(published.status, 200);
    assert.equal((await published.json()).data.status, 'PUBLISHED');

    const detail = await fetch(`${baseUrl}/products/${productId}`, { headers });
    assert.equal(detail.status, 200);
    const detailBody = await detail.json();
    assert.equal(detailBody.data.status, 'PUBLISHED');
    assert.equal(detailBody.data.skus[0].inventories.length, 0);
    const warehouses = await fetch(`${baseUrl}/inventory/warehouses`, { headers });
    assert.equal(warehouses.status, 200);
    const warehouseId = (await warehouses.json()).data[0].id;
    const initialized = await fetch(`${baseUrl}/inventory/records`, { method: 'POST', headers, body: JSON.stringify({ skuId: skuIdForProduct, warehouseId, initialQuantity: 7, alertThreshold: 2 }) });
    assert.equal(initialized.status, 201);
    const initializedBody = await initialized.json();
    inventoryIdForProduct = initializedBody.data.id;
    assert.equal(initializedBody.data.availableQuantity, 7);
    const linked = await fetch(`${baseUrl}/products/${productId}`, { headers });
    const linkedBody = await linked.json();
    assert.equal(linkedBody.data.skus[0].inventories[0].id, inventoryIdForProduct);
    const filteredInventory = await fetch(`${baseUrl}/inventory?skuId=${skuIdForProduct}`, { headers });
    assert.equal(filteredInventory.status, 200);
    assert.equal((await filteredInventory.json()).data.items[0].sku.product.id, productId);
    const transactions = await fetch(`${baseUrl}/inventory/${inventoryIdForProduct}/transactions`, { headers });
    assert.equal(transactions.status, 200);
    assert.ok((await transactions.json()).data.some((item) => item.type === 'RESTOCK'));
    const audit = await fetch(`${baseUrl}/audit-logs?resource=Product&keyword=${productId}`, { headers });
    assert.equal(audit.status, 200);
    const actions = (await audit.json()).data.items.map((item) => item.action);
    assert.ok(actions.includes('PRODUCT_CREATED'));
    assert.ok(actions.includes('PRODUCT_UPDATED'));
    assert.ok(actions.filter((action) => action === 'PRODUCT_STATUS_CHANGED').length >= 2);
  });
});
