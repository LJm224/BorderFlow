import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { tenantWhere } from '../tenants/tenant-query.helper';
import { InventoryService } from '../inventory/inventory.service';
import { ListOrdersDto, UpdateOrderStatusDto } from './order.dto';
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
