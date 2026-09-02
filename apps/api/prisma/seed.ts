import 'dotenv/config';
import { Currency, PrismaClient, ProductStatus, UserRole, ChannelType, ConnectionStatus, MediaType, OrderStatus, InventoryTransactionType } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { id: 'demo-tenant-001' },
    update: { code: 'demo-shop' },
    create: {
      id: 'demo-tenant-001',
      code: 'demo-shop',
      name: 'BorderFlow Demo Store',
      defaultCurrency: Currency.USD,
      defaultTimezone: 'Asia/Shanghai',
    },
  });

  const passwordHash = await hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@borderflow.dev' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Demo Admin',
      email: 'admin@borderflow.dev',
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  for (const demoUser of [
    { email: 'operator@borderflow.dev', name: 'Demo Operator', role: UserRole.OPERATOR },
    { email: 'warehouse@borderflow.dev', name: 'Demo Warehouse', role: UserRole.WAREHOUSE },
    { email: 'analyst@borderflow.dev', name: 'Demo Analyst', role: UserRole.ANALYST },
  ]) {
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: demoUser.email } },
      update: { name: demoUser.name, role: demoUser.role, passwordHash },
      create: { tenantId: tenant.id, name: demoUser.name, email: demoUser.email, passwordHash, role: demoUser.role },
    });
  }

  const secondTenant = await prisma.tenant.upsert({
    where: { id: 'demo-tenant-002' },
    update: { code: 'test-shop' },
    create: {
      id: 'demo-tenant-002',
      code: 'test-shop',
      name: 'BorderFlow Test Store',
      defaultCurrency: Currency.USD,
      defaultTimezone: 'UTC',
    },
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: secondTenant.id, email: 'admin@test.borderflow.dev' } },
    update: {},
    create: {
      tenantId: secondTenant.id,
      name: 'Test Admin',
      email: 'admin@test.borderflow.dev',
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  const store = await prisma.store.upsert({
    where: { id: 'demo-store-001' },
    update: {},
    create: { id: 'demo-store-001', tenantId: tenant.id, name: 'US Demo Store', channelType: ChannelType.SHOPIFY, defaultCurrency: Currency.USD, timezone: 'America/New_York' },
  });
  const warehouse = await prisma.warehouse.upsert({
    where: { id: 'demo-warehouse-001' },
    update: {},
    create: { id: 'demo-warehouse-001', storeId: store.id, name: 'US East Warehouse' },
  });

  const product = await prisma.product.upsert({
    where: { id: 'demo-product-001' },
    update: {},
    create: {
      id: 'demo-product-001',
      tenantId: tenant.id,
      name: 'Demo Travel Backpack',
      description: 'A demo product for local development.',
      market: 'US',
      currency: Currency.USD,
      status: ProductStatus.DRAFT,
    },
  });

  const sku = await prisma.sku.upsert({
    where: { id: 'demo-sku-001' },
    update: {},
    create: { id: 'demo-sku-001', productId: product.id, skuCode: 'BF-BAG-BLACK', variantName: 'Black / Standard', price: 59.99, costPrice: 22.5, weight: 0.8 },
  });
  await prisma.productMarketContent.upsert({
    where: { productId_market_locale: { productId: product.id, market: 'US', locale: 'en-US' } },
    update: {},
    create: { productId: product.id, market: 'US', locale: 'en-US', title: 'Demo Travel Backpack', bulletPoints: ['Lightweight', 'Water resistant', '15-inch laptop sleeve'], description: product.description, keywords: ['travel', 'backpack'], status: ProductStatus.DRAFT },
  });
  await prisma.productMedia.upsert({
    where: { id: 'demo-media-001' },
    update: {},
    create: { id: 'demo-media-001', productId: product.id, url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62', mediaType: MediaType.IMAGE, altText: 'Demo travel backpack', sortOrder: 0 },
  });
  const inventory = await prisma.inventory.upsert({
    where: { skuId_warehouseId: { skuId: sku.id, warehouseId: warehouse.id } },
    update: {},
    create: { skuId: sku.id, warehouseId: warehouse.id, availableQuantity: 48, lockedQuantity: 3, alertThreshold: 10 },
  });
  const order = await prisma.order.upsert({
    where: { id: 'demo-order-001' },
    update: {},
    create: { id: 'demo-order-001', tenantId: tenant.id, storeId: store.id, orderNo: 'BF-DEMO-1001', market: 'US', currency: Currency.USD, totalAmount: 59.99, status: OrderStatus.PAID, shippingCountry: 'US' },
  });
  await prisma.orderItem.upsert({
    where: { id: 'demo-order-item-001' },
    update: {},
    create: { id: 'demo-order-item-001', orderId: order.id, skuId: sku.id, quantity: 1, unitPrice: 59.99 },
  });
  await prisma.orderTimelineEvent.createMany({
    data: [{ orderId: order.id, fromStatus: null, toStatus: OrderStatus.PAID, eventType: 'STATUS_CHANGE', note: 'Demo seed order', actorUserId: admin.id }],
    skipDuplicates: true,
  });
  await prisma.inventoryTransaction.create({ data: { skuId: sku.id, inventoryId: inventory.id, actorUserId: admin.id, type: InventoryTransactionType.RESTOCK, quantity: 51, referenceId: 'seed', reason: 'Initial demo stock', beforeAvailable: 0, afterAvailable: 51, beforeLocked: 0, afterLocked: 0 } });
  const connection = await prisma.channelConnection.upsert({
    where: { storeId_channelType: { storeId: store.id, channelType: ChannelType.SHOPIFY } },
    update: {},
    create: { tenantId: tenant.id, storeId: store.id, channelType: ChannelType.SHOPIFY, externalStoreId: 'demo-shopify-store', status: ConnectionStatus.CONNECTED },
  });
  await prisma.channelSyncRun.create({ data: { connectionId: connection.id, status: 'COMPLETED', totalItems: 1, successItems: 1, finishedAt: new Date() } });
}

main().finally(() => prisma.$disconnect());
