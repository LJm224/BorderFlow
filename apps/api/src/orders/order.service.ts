import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { OrderSource, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { tenantWhere } from '../tenants/tenant-query.helper';
import { InventoryService } from '../inventory/inventory.service';
import { CreateOrderDto, ListOrdersDto, UpdateOrderStatusDto } from './order.dto';
import { AuditLogService } from '../audit/audit.service';

const orderListInclude = {
  store: { select: { id: true, name: true, channelType: true } },
  items: { include: { sku: { select: { skuCode: true, variantName: true } } } },
} as const;

const orderDetailInclude = {
  store: { select: { id: true, name: true, channelType: true } },
  items: { include: { sku: { include: { product: { select: { id: true, name: true } } } }, inventoryAllocations: { include: { inventory: { include: { warehouse: { select: { id: true, name: true } } } } } } } },
  timelineEvents: { orderBy: { createdAt: 'asc' as const } },
} as const;

const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: [OrderStatus.PAID, OrderStatus.CANCELLED],
  PAID: [OrderStatus.PICKING, OrderStatus.CANCELLED, OrderStatus.REFUNDED],
  PICKING: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  SHIPPED: [OrderStatus.COMPLETED],
  COMPLETED: [],
  CANCELLED: [],
  REFUNDED: [],
};

@Injectable()
export class OrderService {
  constructor(private readonly prisma: PrismaService, private readonly inventoryService: InventoryService, @Optional() private readonly auditLogService?: AuditLogService) {}

  async list(tenantId: string, query: ListOrdersDto) {
    const keyword = query.keyword?.trim();
    const where: Prisma.OrderWhereInput = tenantWhere(tenantId, {
      ...(query.status ? { status: query.status } : {}),
      ...(keyword ? { OR: [{ orderNo: { contains: keyword, mode: 'insensitive' } }, { shippingCountry: { contains: keyword, mode: 'insensitive' } }] } : {}),
    });
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({ where, include: orderListInclude, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.order.count({ where }),
    ]);
    return { items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  async getById(tenantId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, tenantId }, include: orderDetailInclude });
    if (!order) throw this.notFound();
    return order;
  }

  async create(tenantId: string, actorUserId: string, dto: CreateOrderDto) {
    if (!dto.items?.length) throw new BadRequestException({ code: 'ORDER_ITEMS_REQUIRED', message: '订单至少需要一个商品' });
    if (dto.status && dto.status !== OrderStatus.PAID && dto.status !== OrderStatus.PENDING_PAYMENT) throw new BadRequestException({ code: 'INVALID_INITIAL_STATUS', message: '手工订单初始状态只能是待付款或已付款' });
    const uniqueSkuIds = new Set(dto.items.map((item) => item.skuId));
    if (uniqueSkuIds.size !== dto.items.length) throw new BadRequestException({ code: 'DUPLICATE_SKU', message: '同一订单中的 SKU 不能重复，请合并数量' });
    const store = await this.prisma.store.findFirst({ where: { id: dto.storeId, tenantId } });
    if (!store) throw new NotFoundException({ code: 'STORE_NOT_FOUND', message: '店铺不存在' });
    if (!store.isActive) throw new BadRequestException({ code: 'STORE_INACTIVE', message: '店铺已停用，不能创建订单' });
    const skus = await this.prisma.sku.findMany({ where: { id: { in: [...uniqueSkuIds] }, product: { tenantId } }, include: { product: { select: { market: true, currency: true, status: true } } } });
    if (skus.length !== uniqueSkuIds.size) throw new BadRequestException({ code: 'SKU_NOT_FOUND', message: '存在不属于当前商户的 SKU' });
    if (skus.some((sku) => sku.product.status === 'OFFLINE')) throw new BadRequestException({ code: 'SKU_PRODUCT_OFFLINE', message: '下架商品不能创建订单' });
    const skuById = new Map(skus.map((sku) => [sku.id, sku]));
    const currency = dto.currency ?? store.defaultCurrency;
    const market = dto.market?.trim().toUpperCase() || skus[0].product.market;
    const totalAmount = dto.items.reduce((sum, item) => {
      const sku = skuById.get(item.skuId)!;
      return sum.add(new Prisma.Decimal(item.unitPrice ?? sku.price).mul(item.quantity));
    }, new Prisma.Decimal(0));
    const orderNo = dto.orderNo?.trim() || `BF-MANUAL-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    const status = dto.status === OrderStatus.PAID ? OrderStatus.PAID : OrderStatus.PENDING_PAYMENT;
    const orderId = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.order.create({
        data: {
          tenantId,
          storeId: dto.storeId,
          orderNo,
          market,
          currency,
          totalAmount,
          status,
          source: OrderSource.MANUAL,
          shippingCountry: dto.shippingCountry.trim().toUpperCase(),
          items: { create: dto.items.map((item) => ({ skuId: item.skuId, quantity: item.quantity, unitPrice: item.unitPrice ?? skuById.get(item.skuId)!.price })) },
          timelineEvents: { create: { fromStatus: null, toStatus: status, eventType: 'ORDER_CREATED', note: '手工创建订单', actorUserId } },
        },
      });
      await this.auditLogService?.record(tenantId, actorUserId, 'ORDER_CREATED', 'Order', created.id, { source: OrderSource.MANUAL, orderNo: created.orderNo, status: created.status }, transaction);
      return created.id;
    });
    return this.getById(tenantId, orderId);
  }

  async updateStatus(tenantId: string, orderId: string, actorUserId: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, tenantId }, select: { id: true, status: true, storeId: true, items: { select: { id: true, skuId: true, quantity: true } } } });
    if (!order) throw this.notFound();
    if (order.status === dto.status) return this.getById(tenantId, orderId);
    if (!transitions[order.status].includes(dto.status)) {
      throw new BadRequestException({ code: 'INVALID_ORDER_TRANSITION', message: `订单不能从${order.status}变更为${dto.status}` });
    }
    await this.prisma.$transaction(async (transaction) => {
      const items = order.items;
      if (order.status === OrderStatus.PAID && dto.status === OrderStatus.PICKING) await this.inventoryService.reserveForOrder(transaction, tenantId, order.storeId, orderId, items, actorUserId);
      if (order.status === OrderStatus.PICKING && dto.status === OrderStatus.SHIPPED) await this.inventoryService.fulfillOrder(transaction, tenantId, order.storeId, orderId, items, actorUserId);
      if (order.status === OrderStatus.PICKING && dto.status === OrderStatus.CANCELLED) await this.inventoryService.releaseOrder(transaction, tenantId, order.storeId, orderId, items, actorUserId);
      await transaction.order.update({ where: { id: orderId }, data: { status: dto.status } });
      await transaction.orderTimelineEvent.create({ data: { orderId, fromStatus: order.status, toStatus: dto.status, eventType: 'STATUS_CHANGE', note: dto.note?.trim() || undefined, actorUserId } });
      await this.auditLogService?.record(tenantId, actorUserId, 'ORDER_STATUS_CHANGED', 'Order', orderId, {
        fromStatus: order.status,
        toStatus: dto.status,
        ...(dto.note?.trim() ? { note: dto.note.trim() } : {}),
      }, transaction);
    });
    return this.getById(tenantId, orderId);
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ code: 'ORDER_NOT_FOUND', message: '订单不存在' });
  }
}
