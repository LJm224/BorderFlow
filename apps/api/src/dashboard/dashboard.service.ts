import { Injectable } from '@nestjs/common';
import { Currency, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const paidStatuses = [OrderStatus.PAID, OrderStatus.PICKING, OrderStatus.SHIPPED, OrderStatus.COMPLETED];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenantId: string) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const previousMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const trendStart = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { defaultCurrency: true } });
    const currency = tenant?.defaultCurrency ?? Currency.USD;
    const [currentSales, previousSales, pendingOrders, totalSkus, inventoryRows, activeChannels, trendOrders, marketOrders, activities] = await Promise.all([
      this.sumOrders(tenantId, monthStart, now, currency),
      this.sumOrders(tenantId, previousMonthStart, monthStart, currency),
      this.prisma.order.count({ where: { tenantId, status: { in: [OrderStatus.PENDING_PAYMENT, OrderStatus.PAID, OrderStatus.PICKING, OrderStatus.SHIPPED] } } }),
      this.prisma.sku.count({ where: { product: { tenantId } } }),
      this.prisma.inventory.findMany({ where: { sku: { product: { tenantId } } }, select: { skuId: true, availableQuantity: true, alertThreshold: true } }),
      this.prisma.channelConnection.count({ where: { tenantId, status: 'CONNECTED' } }),
      this.prisma.order.findMany({ where: { tenantId, currency, createdAt: { gte: trendStart }, status: { in: paidStatuses } }, select: { createdAt: true, totalAmount: true } }),
      this.prisma.order.findMany({ where: { tenantId, currency, createdAt: { gte: monthStart }, status: { in: paidStatuses } }, select: { market: true, totalAmount: true, currency: true, store: { select: { channelType: true } } } }),
      this.prisma.auditLog.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, action: true, resource: true, resourceId: true, createdAt: true } }),
    ]);
    const currentAmount = Number(currentSales._sum.totalAmount ?? 0);
    const previousAmount = Number(previousSales._sum.totalAmount ?? 0);
    const changePct = previousAmount ? Number((((currentAmount - previousAmount) / previousAmount) * 100).toFixed(1)) : null;
    const stockedSkuIds = new Set(inventoryRows.map((row) => row.skuId));
    const lowStockCount = new Set(inventoryRows.filter((row) => row.availableQuantity <= row.alertThreshold).map((row) => row.skuId)).size;
    const unconfiguredSkus = Math.max(totalSkus - stockedSkuIds.size, 0);
    const unhealthySkus = Math.min(totalSkus, lowStockCount + unconfiguredSkus);
    const inventoryPercentage = totalSkus ? Number((((totalSkus - unhealthySkus) / totalSkus) * 100).toFixed(1)) : 100;
    const trend = this.groupTrend(trendOrders);
    const markets = this.groupMarkets(marketOrders);
    return {
      asOf: now.toISOString(),
      sales: { current: currentAmount.toFixed(2), previous: previousAmount.toFixed(2), changePct, currency },
      pendingOrders,
      inventoryHealth: { healthySkus: Math.max(totalSkus - unhealthySkus, 0), totalSkus, lowStockSkus: lowStockCount, unconfiguredSkus, percentage: inventoryPercentage },
      activeChannels,
      salesTrend: trend,
      marketPerformance: markets,
      recentActivities: activities.map((activity) => ({ ...activity, title: this.activityTitle(activity.action, activity.resource), description: activity.resourceId ? `${activity.resource} · ${activity.resourceId}` : activity.resource })),
    };
  }

  private sumOrders(tenantId: string, from: Date, to: Date, currency: Currency) {
    return this.prisma.order.aggregate({ where: { tenantId, currency, createdAt: { gte: from, lt: to }, status: { in: paidStatuses } }, _sum: { totalAmount: true } });
  }

  private groupTrend(orders: { createdAt: Date; totalAmount: Prisma.Decimal }[]) {
    const grouped = new Map<string, { amount: number; orders: number }>();
    for (const order of orders) {
      const date = order.createdAt.toISOString().slice(0, 10);
      const current = grouped.get(date) ?? { amount: 0, orders: 0 };
      current.amount += Number(order.totalAmount);
      current.orders += 1;
      grouped.set(date, current);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, amount: value.amount.toFixed(2), orders: value.orders }));
  }

  private groupMarkets(orders: { market: string; totalAmount: Prisma.Decimal; currency: string; store: { channelType: string } }[]) {
    const grouped = new Map<string, { amount: number; currency: string; orders: number; channelType: string }>();
    for (const order of orders) {
      const current = grouped.get(order.market) ?? { amount: 0, currency: order.currency, orders: 0, channelType: order.store.channelType };
      current.amount += Number(order.totalAmount);
      current.orders += 1;
      grouped.set(order.market, current);
    }
    return [...grouped.entries()].sort(([, a], [, b]) => b.amount - a.amount).map(([market, value]) => ({ market, amount: value.amount.toFixed(2), currency: value.currency, orders: value.orders, channelType: value.channelType }));
  }

  private activityTitle(action: string, resource: string) {
    const labels: Record<string, string> = { ORDER_CREATED: '创建了订单', ORDER_IMPORTED: '导入了 Shopify 订单', ORDER_STATUS_CHANGED: '更新了订单状态', INVENTORY_ADJUSTED: '调整了库存', INVENTORY_RESERVED: '锁定了库存', INVENTORY_FULFILLED: '完成了库存出库', STORE_CREATED: '创建了店铺', WAREHOUSE_CREATED: '创建了仓库' };
    return labels[action] ?? `${resource} 发生了变更`;
  }
}
