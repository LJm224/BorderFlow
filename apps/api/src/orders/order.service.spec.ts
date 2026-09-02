import { describe, expect, test, vi } from 'vitest';
import { OrderStatus } from '@prisma/client';
import { OrderService } from './order.service';

const order = { id: 'demo-order-001', tenantId: 'tenant-1', storeId: 'store-1', status: OrderStatus.PAID, items: [{ skuId: 'sku-1', quantity: 2 }] };

function fakePrisma() {
  return {
    order: {
      findMany: vi.fn().mockResolvedValue([order]),
      count: vi.fn().mockResolvedValue(1),
      findFirst: vi.fn().mockResolvedValue(order),
      update: vi.fn().mockResolvedValue(order),
    },
    orderTimelineEvent: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (callback: (transaction: any) => Promise<unknown>) => callback(undefined)),
  };
}

describe('OrderService', () => {
  test('lists orders with tenant, keyword, status and pagination', async () => {
    const prisma = fakePrisma();
    const service = new OrderService(prisma as never, { reserveForOrder: vi.fn(), fulfillOrder: vi.fn(), releaseOrder: vi.fn() } as never);
    const result = await service.list('tenant-1', { keyword: '1001', status: OrderStatus.PAID, page: 2, pageSize: 10 });
    expect(result.pagination).toEqual({ page: 2, pageSize: 10, total: 1, totalPages: 1 });
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10, where: expect.objectContaining({ tenantId: 'tenant-1', status: OrderStatus.PAID, OR: expect.any(Array) }) }));
  });

  test('rejects cross-tenant order access', async () => {
    const prisma = fakePrisma();
    prisma.order.findFirst.mockResolvedValue(null);
    const service = new OrderService(prisma as never, { reserveForOrder: vi.fn(), fulfillOrder: vi.fn(), releaseOrder: vi.fn() } as never);
    await expect(service.getById('tenant-2', order.id)).rejects.toMatchObject({ response: { code: 'ORDER_NOT_FOUND' } });
  });

  test('updates fulfillment status and writes timeline event', async () => {
    const prisma = fakePrisma();
    const transaction = { order: { update: vi.fn() }, orderTimelineEvent: { create: vi.fn() } };
    prisma.$transaction.mockImplementation(async (callback: (value: typeof transaction) => Promise<unknown>) => callback(transaction));
    const inventoryService = { reserveForOrder: vi.fn(), fulfillOrder: vi.fn(), releaseOrder: vi.fn() };
    const service = new OrderService(prisma as never, inventoryService as never);
    await service.updateStatus('tenant-1', order.id, 'user-1', { status: OrderStatus.PICKING, note: '开始拣货' });
    expect(inventoryService.reserveForOrder).toHaveBeenCalledWith(transaction, 'tenant-1', order.storeId, order.id, order.items, 'user-1');
    expect(transaction.order.update).toHaveBeenCalledWith({ where: { id: order.id }, data: { status: OrderStatus.PICKING } });
    expect(transaction.orderTimelineEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorUserId: 'user-1', fromStatus: OrderStatus.PAID, toStatus: OrderStatus.PICKING }) }));
  });

  test('rejects an invalid status transition', async () => {
    const prisma = fakePrisma();
    prisma.order.findFirst.mockResolvedValue({ ...order, status: OrderStatus.COMPLETED });
    const service = new OrderService(prisma as never, { reserveForOrder: vi.fn(), fulfillOrder: vi.fn(), releaseOrder: vi.fn() } as never);
    await expect(service.updateStatus('tenant-1', order.id, 'user-1', { status: OrderStatus.PICKING })).rejects.toMatchObject({ response: { code: 'INVALID_ORDER_TRANSITION' } });
  });
});
