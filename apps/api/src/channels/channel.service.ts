import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ChannelType, ConnectionStatus, Currency, OrderSource, OrderStatus, Prisma, SyncRunStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit/audit.service';
import { CreateChannelSkuMappingDto, ImportMockShopifyOrdersDto } from './channel.dto';

@Injectable()
export class ChannelService {
  constructor(private readonly prisma: PrismaService, private readonly auditLogService: AuditLogService) {}

  async listConnections(tenantId: string) {
    return this.prisma.channelConnection.findMany({
      where: { tenantId },
      include: {
        store: { select: { id: true, name: true, channelType: true, defaultCurrency: true } },
        skuMappings: { include: { sku: { select: { id: true, skuCode: true, variantName: true, product: { select: { id: true, name: true } } } } }, orderBy: { externalSku: 'asc' } },
        syncRuns: { orderBy: { startedAt: 'desc' }, take: 5, include: { logs: { orderBy: { createdAt: 'asc' } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createSkuMapping(tenantId: string, actorUserId: string, connectionId: string, dto: CreateChannelSkuMappingDto) {
    const connection = await this.ensureShopifyConnection(tenantId, connectionId);
    const sku = await this.prisma.sku.findFirst({ where: { id: dto.skuId, product: { tenantId } }, select: { id: true, skuCode: true } });
    if (!sku) throw new NotFoundException({ code: 'SKU_NOT_FOUND', message: 'SKU 不存在' });
    try {
      const mapping = await this.prisma.channelSkuMapping.upsert({
        where: { connectionId_skuId: { connectionId, skuId: dto.skuId } },
        update: { externalSku: dto.externalSku.trim() },
        create: { tenantId, connectionId, skuId: dto.skuId, externalSku: dto.externalSku.trim() },
        include: { sku: { select: { id: true, skuCode: true, variantName: true } } },
      });
      await this.auditLogService.record(tenantId, actorUserId, 'CHANNEL_SKU_MAPPED', 'ChannelSkuMapping', mapping.id, { connectionId, skuId: sku.id, externalSku: mapping.externalSku });
      return mapping;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'EXTERNAL_SKU_EXISTS', message: '该外部 SKU 已映射到其他本地 SKU' });
      throw error;
    }
  }

  async importMockShopifyOrders(tenantId: string, actorUserId: string, connectionId: string, dto: ImportMockShopifyOrdersDto) {
    const connection = await this.ensureShopifyConnection(tenantId, connectionId);
    const run = await this.prisma.channelSyncRun.create({ data: { connectionId, status: SyncRunStatus.RUNNING, totalItems: dto.orders.length } });
    let successItems = 0;
    let failedItems = 0;
    const importedOrderIds: string[] = [];
    for (const payload of dto.orders) {
      const externalOrderId = payload.externalOrderId.trim();
      try {
        const duplicate = await this.prisma.order.findFirst({ where: { tenantId, channelConnectionId: connectionId, externalOrderId }, select: { id: true } });
        if (duplicate) {
          failedItems += 1;
          await this.prisma.channelSyncLog.create({ data: { syncRunId: run.id, resource: 'ORDER', resourceId: externalOrderId, status: 'SKIPPED', errorCode: 'DUPLICATE_ORDER', message: '外部订单已导入' } });
          continue;
        }
        const mappings = await this.prisma.channelSkuMapping.findMany({ where: { connectionId, externalSku: { in: payload.items.map((item) => item.externalSku.trim()) } }, include: { sku: { select: { id: true, price: true, product: { select: { market: true, currency: true, tenantId: true } } } } } });
        const mappingByExternal = new Map(mappings.map((mapping) => [mapping.externalSku, mapping]));
        const unresolved = payload.items.filter((item) => !mappingByExternal.has(item.externalSku.trim()));
        if (unresolved.length) {
          failedItems += 1;
          await this.prisma.channelSyncLog.create({ data: { syncRunId: run.id, resource: 'ORDER', resourceId: externalOrderId, status: 'FAILED', errorCode: 'UNMAPPED_SKU', message: `未映射 SKU：${unresolved.map((item) => item.externalSku).join(', ')}` } });
          continue;
        }
        const currency = payload.currency ?? connection.store.defaultCurrency;
        const market = payload.market?.trim().toUpperCase() || mappings[0].sku.product.market;
        const totalAmount = payload.items.reduce((sum, item) => {
          const mapping = mappingByExternal.get(item.externalSku.trim())!;
          return sum.add(new Prisma.Decimal(item.unitPrice ?? mapping.sku.price).mul(item.quantity));
        }, new Prisma.Decimal(0));
        const status = payload.financialStatus === 'pending' ? OrderStatus.PENDING_PAYMENT : OrderStatus.PAID;
        const orderNo = payload.orderNo?.trim() || `SHOPIFY-${externalOrderId}`;
        const createdId = await this.prisma.$transaction(async (transaction) => {
          const created = await transaction.order.create({
            data: {
              tenantId,
              storeId: connection.storeId,
              orderNo,
              market,
              currency,
              totalAmount,
              status,
              source: OrderSource.SHOPIFY,
              externalOrderId,
              channelConnectionId: connectionId,
              shippingCountry: payload.shippingCountry.trim().toUpperCase(),
              items: { create: payload.items.map((item) => { const mapping = mappingByExternal.get(item.externalSku.trim())!; return { skuId: mapping.sku.id, quantity: item.quantity, unitPrice: item.unitPrice ?? mapping.sku.price }; }) },
              timelineEvents: { create: { fromStatus: null, toStatus: status, eventType: 'ORDER_IMPORTED', note: 'Shopify Mock 导入', actorUserId } },
            },
          });
          await this.auditLogService.record(tenantId, actorUserId, 'ORDER_IMPORTED', 'Order', created.id, { source: OrderSource.SHOPIFY, externalOrderId, connectionId }, transaction);
          return created.id;
        });
        importedOrderIds.push(createdId);
        successItems += 1;
        await this.prisma.channelSyncLog.create({ data: { syncRunId: run.id, resource: 'ORDER', resourceId: externalOrderId, status: 'SUCCESS', metadata: { orderId: createdId } } });
      } catch (error) {
        failedItems += 1;
        const message = error instanceof Error ? error.message.slice(0, 500) : '导入失败';
        await this.prisma.channelSyncLog.create({ data: { syncRunId: run.id, resource: 'ORDER', resourceId: externalOrderId, status: 'FAILED', errorCode: 'IMPORT_ERROR', message } });
      }
    }
    const status = failedItems && !successItems ? SyncRunStatus.FAILED : SyncRunStatus.COMPLETED;
    const finishedAt = new Date();
    await this.prisma.channelSyncRun.update({ where: { id: run.id }, data: { status, successItems, failedItems, finishedAt } });
    await this.prisma.channelConnection.update({ where: { id: connectionId }, data: { lastSyncedAt: finishedAt } });
    return { runId: run.id, status, totalItems: dto.orders.length, successItems, failedItems, importedOrderIds };
  }

  private async ensureShopifyConnection(tenantId: string, connectionId: string) {
    const connection = await this.prisma.channelConnection.findFirst({ where: { id: connectionId, tenantId }, include: { store: { select: { id: true, defaultCurrency: true, isActive: true } } } });
    if (!connection) throw new NotFoundException({ code: 'CHANNEL_CONNECTION_NOT_FOUND', message: '渠道连接不存在' });
    if (connection.channelType !== ChannelType.SHOPIFY) throw new BadRequestException({ code: 'CHANNEL_NOT_SHOPIFY', message: '当前连接不是 Shopify' });
    if (connection.status !== ConnectionStatus.CONNECTED) throw new BadRequestException({ code: 'CHANNEL_NOT_CONNECTED', message: 'Shopify 连接未就绪' });
    if (!connection.store.isActive) throw new BadRequestException({ code: 'STORE_INACTIVE', message: '店铺已停用' });
    return connection;
  }
}
