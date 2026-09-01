import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryTransactionType, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { tenantWhere } from '../tenants/tenant-query.helper';
import { AdjustInventoryDto, ListInventoryDto } from './inventory.dto';

const inventoryInclude = {
  sku: { include: { product: { select: { id: true, name: true, market: true } } } },
  warehouse: { include: { store: { select: { id: true, name: true, tenantId: true } } } },
} as const;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: ListInventoryDto) {
    const keyword = query.keyword?.trim();
    const where: Prisma.InventoryWhereInput = {
      warehouse: { store: { tenantId } },
      ...(keyword ? { OR: [{ sku: { skuCode: { contains: keyword, mode: 'insensitive' } } }, { sku: { product: { name: { contains: keyword, mode: 'insensitive' } } } }, { warehouse: { name: { contains: keyword, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.inventory.findMany({ where, include: inventoryInclude, orderBy: { updatedAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.inventory.count({ where }),
    ]);
    return { items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  async getById(tenantId: string, inventoryId: string) {
    const inventory = await this.prisma.inventory.findFirst({ where: { id: inventoryId, warehouse: { store: { tenantId } } }, include: inventoryInclude });
    if (!inventory) throw this.notFound();
    return inventory;
  }

  async adjust(tenantId: string, actorUserId: string, dto: AdjustInventoryDto) {
    const inventory = await this.prisma.inventory.findFirst({ where: { skuId: dto.skuId, warehouseId: dto.warehouseId, warehouse: { store: { tenantId } } }, select: { id: true, skuId: true, availableQuantity: true } });
    if (!inventory) throw this.notFound();
    if (dto.type !== InventoryTransactionType.ADJUSTMENT && dto.quantity <= 0) {
      throw new BadRequestException({ code: 'INVALID_INVENTORY_QUANTITY', message: '入库或出库数量必须大于 0' });
    }
    const delta = dto.type === InventoryTransactionType.RESTOCK ? dto.quantity : dto.type === InventoryTransactionType.SALE ? -dto.quantity : dto.quantity;
    if (inventory.availableQuantity + delta < 0) {
      throw new BadRequestException({ code: 'INSUFFICIENT_STOCK', message: '可用库存不足' });
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.inventory.update({ where: { id: inventory.id }, data: { availableQuantity: { increment: delta } } });
      await transaction.inventoryTransaction.create({ data: { skuId: inventory.skuId, type: dto.type, quantity: dto.quantity, referenceId: actorUserId, reason: dto.reason?.trim() || undefined } });
    });
    return this.getById(tenantId, inventory.id);
  }

  async reserveForOrder(transaction: Prisma.TransactionClient, tenantId: string, storeId: string, orderId: string, items: Array<{ skuId: string; quantity: number }>): Promise<void> {
    for (const item of items) {
      const inventory = await transaction.inventory.findFirst({ where: { skuId: item.skuId, warehouse: { store: { id: storeId, tenantId } } }, select: { id: true } });
      if (!inventory) throw new BadRequestException({ code: 'INVENTORY_NOT_FOUND', message: '订单商品没有对应库存' });
      const updated = await transaction.inventory.updateMany({ where: { id: inventory.id, availableQuantity: { gte: item.quantity } }, data: { availableQuantity: { decrement: item.quantity }, lockedQuantity: { increment: item.quantity } } });
      if (updated.count !== 1) throw new BadRequestException({ code: 'INSUFFICIENT_STOCK', message: '订单商品库存不足，无法拣货' });
      await transaction.inventoryTransaction.create({ data: { skuId: item.skuId, type: InventoryTransactionType.RESERVATION, quantity: item.quantity, referenceId: orderId, reason: '订单锁定库存' } });
    }
  }

  async fulfillOrder(transaction: Prisma.TransactionClient, tenantId: string, storeId: string, orderId: string, items: Array<{ skuId: string; quantity: number }>): Promise<void> {
    for (const item of items) {
      const inventory = await transaction.inventory.findFirst({ where: { skuId: item.skuId, warehouse: { store: { id: storeId, tenantId } } }, select: { id: true } });
      if (!inventory) throw new BadRequestException({ code: 'INVENTORY_NOT_FOUND', message: '订单商品没有对应库存' });
      const updated = await transaction.inventory.updateMany({ where: { id: inventory.id, lockedQuantity: { gte: item.quantity } }, data: { lockedQuantity: { decrement: item.quantity } } });
      if (updated.count !== 1) throw new BadRequestException({ code: 'INSUFFICIENT_LOCKED_STOCK', message: '锁定库存不足，无法发货' });
      await transaction.inventoryTransaction.create({ data: { skuId: item.skuId, type: InventoryTransactionType.SALE, quantity: item.quantity, referenceId: orderId, reason: '订单发货扣减库存' } });
    }
  }

  async releaseOrder(transaction: Prisma.TransactionClient, tenantId: string, storeId: string, orderId: string, items: Array<{ skuId: string; quantity: number }>): Promise<void> {
    for (const item of items) {
      const inventory = await transaction.inventory.findFirst({ where: { skuId: item.skuId, warehouse: { store: { id: storeId, tenantId } } }, select: { id: true } });
      if (!inventory) throw new BadRequestException({ code: 'INVENTORY_NOT_FOUND', message: '订单商品没有对应库存' });
      const updated = await transaction.inventory.updateMany({ where: { id: inventory.id, lockedQuantity: { gte: item.quantity } }, data: { availableQuantity: { increment: item.quantity }, lockedQuantity: { decrement: item.quantity } } });
      if (updated.count !== 1) throw new BadRequestException({ code: 'INSUFFICIENT_LOCKED_STOCK', message: '锁定库存不足，无法释放' });
      await transaction.inventoryTransaction.create({ data: { skuId: item.skuId, type: InventoryTransactionType.RELEASE, quantity: item.quantity, referenceId: orderId, reason: '订单取消释放库存' } });
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ code: 'INVENTORY_NOT_FOUND', message: '库存记录不存在' });
  }
}
