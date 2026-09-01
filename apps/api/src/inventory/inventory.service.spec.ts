import { describe, expect, test, vi } from 'vitest';
import { InventoryTransactionType } from '@prisma/client';
import { InventoryService } from './inventory.service';

const inventory = { id: 'inventory-1', skuId: 'sku-1', warehouseId: 'warehouse-1', availableQuantity: 10 };

function fakePrisma() {
  return {
    inventory: { findMany: vi.fn().mockResolvedValue([inventory]), count: vi.fn().mockResolvedValue(1), findFirst: vi.fn().mockResolvedValue(inventory), update: vi.fn() },
    inventoryTransaction: { create: vi.fn() },
    $transaction: vi.fn(async (callback: (transaction: any) => Promise<unknown>) => callback({ inventory: { update: vi.fn() }, inventoryTransaction: { create: vi.fn() } })),
  };
}

describe('InventoryService', () => {
  test('lists inventory with tenant scope, keyword and pagination', async () => {
    const prisma = fakePrisma();
    const result = await new InventoryService(prisma as never).list('tenant-1', { keyword: 'bag', page: 2, pageSize: 10 });
    expect(result.pagination).toEqual({ page: 2, pageSize: 10, total: 1, totalPages: 1 });
    expect(prisma.inventory.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10, where: expect.objectContaining({ warehouse: expect.any(Object), OR: expect.any(Array) }) }));
  });

  test('increases available stock for restock', async () => {
    const prisma = fakePrisma();
    const update = vi.fn();
    const create = vi.fn();
    prisma.$transaction.mockImplementation(async (callback: (transaction: any) => Promise<unknown>) => callback({ inventory: { update }, inventoryTransaction: { create } }));
    await new InventoryService(prisma as never).adjust('tenant-1', 'user-1', { skuId: 'sku-1', warehouseId: 'warehouse-1', type: InventoryTransactionType.RESTOCK, quantity: 5, reason: '补货' });
    expect(update).toHaveBeenCalledWith({ where: { id: inventory.id }, data: { availableQuantity: { increment: 5 } } });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: InventoryTransactionType.RESTOCK, quantity: 5 }) }));
  });

  test('rejects an adjustment that would make stock negative', async () => {
    const prisma = fakePrisma();
    await expect(new InventoryService(prisma as never).adjust('tenant-1', 'user-1', { skuId: 'sku-1', warehouseId: 'warehouse-1', type: InventoryTransactionType.SALE, quantity: 11 })).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_STOCK' } });
  });

  test('rejects cross-tenant inventory access', async () => {
    const prisma = fakePrisma();
    prisma.inventory.findFirst.mockResolvedValue(null);
    await expect(new InventoryService(prisma as never).getById('tenant-2', inventory.id)).rejects.toMatchObject({ response: { code: 'INVENTORY_NOT_FOUND' } });
  });

  test('reserves stock when an order enters picking', async () => {
    const service = new InventoryService(fakePrisma() as never);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn();
    const transaction = { inventory: { findFirst: vi.fn().mockResolvedValue({ id: inventory.id }), updateMany }, inventoryTransaction: { create } };
    await service.reserveForOrder(transaction as never, 'tenant-1', 'store-1', 'order-1', [{ skuId: inventory.skuId, quantity: 2 }]);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: inventory.id, availableQuantity: { gte: 2 } }, data: expect.objectContaining({ availableQuantity: { decrement: 2 }, lockedQuantity: { increment: 2 } }) }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: InventoryTransactionType.RESERVATION, referenceId: 'order-1' }) }));
  });

  test('releases locked stock when a picking order is cancelled', async () => {
    const service = new InventoryService(fakePrisma() as never);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = { inventory: { findFirst: vi.fn().mockResolvedValue({ id: inventory.id }), updateMany }, inventoryTransaction: { create: vi.fn() } };
    await service.releaseOrder(transaction as never, 'tenant-1', 'store-1', 'order-1', [{ skuId: inventory.skuId, quantity: 2 }]);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { availableQuantity: { increment: 2 }, lockedQuantity: { decrement: 2 } } }));
  });
});
