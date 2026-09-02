import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit/audit.service';
import { CreateStoreDto, CreateWarehouseDto, ListWarehousesQueryDto, UpdateStoreDto, UpdateWarehouseDto } from './store.dto';

const storeInclude = {
  warehouses: { orderBy: { name: 'asc' as const }, select: { id: true, name: true, createdAt: true, _count: { select: { inventories: true } } } },
  connections: { select: { id: true, channelType: true, status: true, externalStoreId: true, lastSyncedAt: true } },
} as const;

@Injectable()
export class StoreService {
  constructor(private readonly prisma: PrismaService, private readonly auditLogService: AuditLogService) {}

  list(tenantId: string) {
    return this.prisma.store.findMany({ where: { tenantId }, include: storeInclude, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
  }

  async listWarehouses(tenantId: string, query: ListWarehousesQueryDto) {
    return this.prisma.warehouse.findMany({
      where: { store: { tenantId }, ...(query.storeId ? { storeId: query.storeId } : {}) },
      include: { store: { select: { id: true, name: true, channelType: true } }, _count: { select: { inventories: true } } },
      orderBy: [{ store: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  async createStore(tenantId: string, actorUserId: string, dto: CreateStoreDto) {
    try {
      const store = await this.prisma.store.create({
        data: { tenantId, name: dto.name.trim(), channelType: dto.channelType, defaultCurrency: dto.defaultCurrency, timezone: dto.timezone?.trim() },
        include: storeInclude,
      });
      await this.auditLogService.record(tenantId, actorUserId, 'STORE_CREATED', 'Store', store.id, { name: store.name, channelType: store.channelType });
      return store;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'STORE_NAME_EXISTS', message: '同一工作空间下店铺名称不能重复' });
      throw error;
    }
  }

  async updateStore(tenantId: string, actorUserId: string, storeId: string, dto: UpdateStoreDto) {
    await this.ensureStore(tenantId, storeId);
    try {
      const store = await this.prisma.store.update({ where: { id: storeId }, data: { ...dto, ...(dto.name ? { name: dto.name.trim() } : {}), ...(dto.timezone ? { timezone: dto.timezone.trim() } : {}) }, include: storeInclude });
      await this.auditLogService.record(tenantId, actorUserId, 'STORE_UPDATED', 'Store', store.id, dto as Prisma.InputJsonValue);
      return store;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'STORE_NAME_EXISTS', message: '同一工作空间下店铺名称不能重复' });
      throw error;
    }
  }

  async createWarehouse(tenantId: string, actorUserId: string, dto: CreateWarehouseDto) {
    await this.ensureStore(tenantId, dto.storeId);
    try {
      const warehouse = await this.prisma.warehouse.create({ data: { storeId: dto.storeId, name: dto.name.trim() }, include: { store: { select: { id: true, name: true, channelType: true } } } });
      await this.auditLogService.record(tenantId, actorUserId, 'WAREHOUSE_CREATED', 'Warehouse', warehouse.id, { storeId: dto.storeId, name: warehouse.name });
      return warehouse;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'WAREHOUSE_NAME_EXISTS', message: '同一店铺下仓库名称不能重复' });
      throw error;
    }
  }

  async updateWarehouse(tenantId: string, actorUserId: string, warehouseId: string, dto: UpdateWarehouseDto) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: warehouseId, store: { tenantId } } });
    if (!warehouse) throw new NotFoundException({ code: 'WAREHOUSE_NOT_FOUND', message: '仓库不存在' });
    try {
      const updated = await this.prisma.warehouse.update({ where: { id: warehouseId }, data: dto.name ? { name: dto.name.trim() } : {}, include: { store: { select: { id: true, name: true, channelType: true } } } });
      await this.auditLogService.record(tenantId, actorUserId, 'WAREHOUSE_UPDATED', 'Warehouse', warehouseId, dto as Prisma.InputJsonValue);
      return updated;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'WAREHOUSE_NAME_EXISTS', message: '同一店铺下仓库名称不能重复' });
      throw error;
    }
  }

  private async ensureStore(tenantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId } });
    if (!store) throw new NotFoundException({ code: 'STORE_NOT_FOUND', message: '店铺不存在' });
    return store;
  }
}
