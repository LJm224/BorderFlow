import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InventoryAllocationStatus, InventoryTransactionType, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AdjustInventoryDto, InitializeInventoryDto, ListInventoryDto, ListWarehousesDto } from './inventory.dto';
import { AuditLogService } from '../audit/audit.service';

const inventoryInclude = {
  sku: { include: { product: { select: { id: true, name: true, market: true } } } },
  warehouse: { include: { store: { select: { id: true, name: true, tenantId: true } } } },
} as const;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly auditLogService?: AuditLogService) {}

  async list(tenantId: string, query: ListInventoryDto) {
    const keyword = query.keyword?.trim();
    const where: Prisma.InventoryWhereInput = {
      warehouse: { store: { tenantId } },
      ...(query.skuId ? { skuId: query.skuId } : {}),
      ...(query.productId ? { sku: { productId: query.productId } } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(keyword ? { OR: [{ sku: { skuCode: { contains: keyword, mode: 'insensitive' } } }, { sku: { product: { name: { contains: keyword, mode: 'insensitive' } } } }, { warehouse: { name: { contains: keyword, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.inventory.findMany({ where, include: inventoryInclude, orderBy: { updatedAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.inventory.count({ where }),
    ]);
    return { items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  async listWarehouses(tenantId: string, query: ListWarehousesDto) {
    return this.prisma.warehouse.findMany({
      where: { store: { tenantId, ...(query.storeId ? { id: query.storeId } : {}) } },
      include: { store: { select: { id: true, name: true, channelType: true } } },
      orderBy: [{ store: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  async getById(tenantId: string, inventoryId: string) {
    const inventory = await this.prisma.inventory.findFirst({ where: { id: inventoryId, warehouse: { store: { tenantId } } }, include: inventoryInclude });
    if (!inventory) throw this.notFound();
    return inventory;
  }

  async listTransactions(tenantId: string, inventoryId: string) {
    const inventory = await this.prisma.inventory.findFirst({ where: { id: inventoryId, warehouse: { store: { tenantId } } }, select: { id: true } });
    if (!inventory) throw this.notFound();
    return this.prisma.inventoryTransaction.findMany({ where: { inventoryId }, orderBy: { createdAt: 'desc' } });
  }

  async initialize(tenantId: string, actorUserId: string, dto: InitializeInventoryDto) {
    try {
      const inventory = await this.prisma.$transaction(async (transaction) => {
        const [sku, warehouse] = await Promise.all([
          transaction.sku.findFirst({ where: { id: dto.skuId, product: { tenantId } }, select: { id: true, skuCode: true, productId: true } }),
          transaction.warehouse.findFirst({ where: { id: dto.warehouseId, store: { tenantId } }, select: { id: true, name: true, storeId: true } }),
        ]);
        if (!sku) throw new NotFoundException({ code: 'SKU_NOT_FOUND', message: 'SKU 不存在或不属于当前商户' });
        if (!warehouse) throw new NotFoundException({ code: 'WAREHOUSE_NOT_FOUND', message: '仓库不存在或不属于当前商户' });
        const created = await transaction.inventory.create({
          data: { skuId: sku.id, warehouseId: warehouse.id, availableQuantity: dto.initialQuantity, alertThreshold: dto.alertThreshold },
        });
        if (dto.initialQuantity > 0) {
          await transaction.inventoryTransaction.create({
            data: {
              skuId: sku.id,
              inventoryId: created.id,
              actorUserId,
              type: InventoryTransactionType.RESTOCK,
              quantity: dto.initialQuantity,
              referenceId: created.id,
              reason: '期初库存',
              beforeAvailable: 0,
              afterAvailable: dto.initialQuantity,
              beforeLocked: 0,
              afterLocked: 0,
            },
          });
        }
        await this.auditLogService?.record(tenantId, actorUserId, 'INVENTORY_CREATED', 'Inventory', created.id, {
          skuId: sku.id,
          skuCode: sku.skuCode,
          warehouseId: warehouse.id,
          initialQuantity: dto.initialQuantity,
          alertThreshold: dto.alertThreshold,
        }, transaction);
        return created;
      });
      return this.getById(tenantId, inventory.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'INVENTORY_EXISTS', message: '该 SKU 在此仓库已经配置库存' });
      }
      throw error;
    }
  }

  async adjust(tenantId: string, actorUserId: string, dto: AdjustInventoryDto) {
    if (dto.type !== InventoryTransactionType.ADJUSTMENT && dto.quantity <= 0) {
      throw new BadRequestException({ code: 'INVALID_INVENTORY_QUANTITY', message: '入库或出库数量必须大于 0' });
    }
    const delta = dto.type === InventoryTransactionType.RESTOCK ? dto.quantity : dto.type === InventoryTransactionType.SALE ? -dto.quantity : dto.quantity;
    const inventoryId = await this.prisma.$transaction(async (transaction) => {
      const inventory = await transaction.inventory.findFirst({ where: { skuId: dto.skuId, warehouseId: dto.warehouseId, warehouse: { store: { tenantId } } }, select: { id: true, skuId: true, availableQuantity: true, lockedQuantity: true } });
      if (!inventory) throw this.notFound();
      const updated = await transaction.inventory.updateMany({
        where: { id: inventory.id, ...(delta < 0 ? { availableQuantity: { gte: -delta } } : {}) },
        data: { availableQuantity: { increment: delta } },
      });
      if (updated.count !== 1) throw new BadRequestException({ code: 'INSUFFICIENT_STOCK', message: '可用库存不足' });
      await transaction.inventoryTransaction.create({ data: {
        skuId: inventory.skuId,
        inventoryId: inventory.id,
        actorUserId,
        type: dto.type,
        quantity: dto.quantity,
        referenceId: actorUserId,
        reason: dto.reason?.trim() || undefined,
        beforeAvailable: inventory.availableQuantity,
        afterAvailable: inventory.availableQuantity + delta,
        beforeLocked: inventory.lockedQuantity,
        afterLocked: inventory.lockedQuantity,
      } });
      await this.auditLogService?.record(tenantId, actorUserId, 'INVENTORY_ADJUSTED', 'Inventory', inventory.id, {
        skuId: inventory.skuId,
        warehouseId: dto.warehouseId,
        type: dto.type,
        quantity: dto.quantity,
        ...(dto.reason?.trim() ? { reason: dto.reason.trim() } : {}),
      }, transaction);
      return inventory.id;
    });
    return this.getById(tenantId, inventoryId);
  }

  async reserveForOrder(transaction: Prisma.TransactionClient, tenantId: string, storeId: string, orderId: string, items: Array<{ id: string; skuId: string; quantity: number }>, actorUserId?: string): Promise<void> {
    for (const item of items) {
      const inventories = await transaction.inventory.findMany({ where: { skuId: item.skuId, warehouse: { store: { id: storeId, tenantId } } }, select: { id: true, skuId: true, availableQuantity: true, lockedQuantity: true, warehouseId: true }, orderBy: { warehouseId: 'asc' } });
      if (!inventories.length) throw new BadRequestException({ code: 'INVENTORY_NOT_FOUND', message: '订单商品尚未配置对应仓库库存' });
      let remaining = item.quantity;
      for (const inventory of inventories) {
        if (remaining <= 0) break;
        const quantity = Math.min(remaining, inventory.availableQuantity);
        if (quantity <= 0) continue;
        const updated = await transaction.inventory.updateMany({ where: { id: inventory.id, availableQuantity: { gte: quantity } }, data: { availableQuantity: { decrement: quantity }, lockedQuantity: { increment: quantity } } });
        if (updated.count !== 1) throw new BadRequestException({ code: 'INVENTORY_CONFLICT', message: '库存发生变化，请重试' });
        await transaction.inventoryAllocation.create({ data: { orderId, orderItemId: item.id, inventoryId: inventory.id, quantity, status: InventoryAllocationStatus.RESERVED } });
        await transaction.inventoryTransaction.create({ data: { skuId: item.skuId, inventoryId: inventory.id, actorUserId, type: InventoryTransactionType.RESERVATION, quantity, referenceId: orderId, reason: '订单锁定库存', beforeAvailable: inventory.availableQuantity, afterAvailable: inventory.availableQuantity - quantity, beforeLocked: inventory.lockedQuantity, afterLocked: inventory.lockedQuantity + quantity } });
        await this.recordAudit(tenantId, actorUserId, 'INVENTORY_RESERVED', inventory.id, { orderId, skuId: item.skuId, quantity, warehouseId: inventory.warehouseId }, transaction);
        remaining -= quantity;
      }
      if (remaining > 0) throw new BadRequestException({ code: 'INSUFFICIENT_STOCK', message: '订单商品库存不足，无法拣货' });
    }
  }

  async fulfillOrder(transaction: Prisma.TransactionClient, tenantId: string, storeId: string, orderId: string, items: Array<{ id: string; skuId: string; quantity: number }>, actorUserId?: string): Promise<void> {
    for (const item of items) {
      const allocations = await transaction.inventoryAllocation.findMany({ where: { orderId, orderItemId: item.id, status: InventoryAllocationStatus.RESERVED, inventory: { warehouse: { store: { id: storeId, tenantId } } } }, include: { inventory: { select: { id: true, skuId: true, warehouseId: true, availableQuantity: true, lockedQuantity: true } } } });
      const allocatedQuantity = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
      if (allocatedQuantity !== item.quantity) throw new BadRequestException({ code: 'INVENTORY_ALLOCATION_NOT_FOUND', message: '订单库存分配记录不存在或数量不一致' });
      for (const allocation of allocations) {
        const updated = await transaction.inventory.updateMany({ where: { id: allocation.inventory.id, lockedQuantity: { gte: allocation.quantity } }, data: { lockedQuantity: { decrement: allocation.quantity } } });
        if (updated.count !== 1) throw new BadRequestException({ code: 'INSUFFICIENT_LOCKED_STOCK', message: '锁定库存不足，无法发货' });
        await transaction.inventoryAllocation.update({ where: { id: allocation.id }, data: { status: InventoryAllocationStatus.FULFILLED } });
        await transaction.inventoryTransaction.create({ data: { skuId: allocation.inventory.skuId, inventoryId: allocation.inventory.id, actorUserId, type: InventoryTransactionType.SALE, quantity: allocation.quantity, referenceId: orderId, reason: '订单发货扣减库存', beforeAvailable: allocation.inventory.availableQuantity, afterAvailable: allocation.inventory.availableQuantity, beforeLocked: allocation.inventory.lockedQuantity, afterLocked: allocation.inventory.lockedQuantity - allocation.quantity } });
        await this.recordAudit(tenantId, actorUserId, 'INVENTORY_FULFILLED', allocation.inventory.id, { orderId, skuId: item.skuId, quantity: allocation.quantity, warehouseId: allocation.inventory.warehouseId }, transaction);
      }
    }
  }

  async releaseOrder(transaction: Prisma.TransactionClient, tenantId: string, storeId: string, orderId: string, items: Array<{ id: string; skuId: string; quantity: number }>, actorUserId?: string): Promise<void> {
    for (const item of items) {
      const allocations = await transaction.inventoryAllocation.findMany({ where: { orderId, orderItemId: item.id, status: InventoryAllocationStatus.RESERVED, inventory: { warehouse: { store: { id: storeId, tenantId } } } }, include: { inventory: { select: { id: true, skuId: true, warehouseId: true, availableQuantity: true, lockedQuantity: true } } } });
      const allocatedQuantity = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
      if (allocatedQuantity !== item.quantity) throw new BadRequestException({ code: 'INVENTORY_ALLOCATION_NOT_FOUND', message: '订单库存分配记录不存在或数量不一致' });
      for (const allocation of allocations) {
        const updated = await transaction.inventory.updateMany({ where: { id: allocation.inventory.id, lockedQuantity: { gte: allocation.quantity } }, data: { availableQuantity: { increment: allocation.quantity }, lockedQuantity: { decrement: allocation.quantity } } });
        if (updated.count !== 1) throw new BadRequestException({ code: 'INSUFFICIENT_LOCKED_STOCK', message: '锁定库存不足，无法释放' });
        await transaction.inventoryAllocation.update({ where: { id: allocation.id }, data: { status: InventoryAllocationStatus.RELEASED } });
        await transaction.inventoryTransaction.create({ data: { skuId: allocation.inventory.skuId, inventoryId: allocation.inventory.id, actorUserId, type: InventoryTransactionType.RELEASE, quantity: allocation.quantity, referenceId: orderId, reason: '订单取消释放库存', beforeAvailable: allocation.inventory.availableQuantity, afterAvailable: allocation.inventory.availableQuantity + allocation.quantity, beforeLocked: allocation.inventory.lockedQuantity, afterLocked: allocation.inventory.lockedQuantity - allocation.quantity } });
        await this.recordAudit(tenantId, actorUserId, 'INVENTORY_RELEASED', allocation.inventory.id, { orderId, skuId: item.skuId, quantity: allocation.quantity, warehouseId: allocation.inventory.warehouseId }, transaction);
      }
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ code: 'INVENTORY_NOT_FOUND', message: '库存记录不存在' });
  }

  private recordAudit(tenantId: string, actorUserId: string | undefined, action: string, resourceId: string, metadata: Prisma.InputJsonValue, transaction: Prisma.TransactionClient): Promise<unknown> {
    if (!actorUserId || !this.auditLogService) return Promise.resolve();
    return this.auditLogService.record(tenantId, actorUserId, action, 'Inventory', resourceId, metadata, transaction);
  }
}
