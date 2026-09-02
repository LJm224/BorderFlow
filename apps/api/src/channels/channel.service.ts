import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ChannelType, ConnectionStatus, Currency, OrderSource, OrderStatus, Prisma, SyncRunStatus } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit/audit.service';
import { CreateChannelSkuMappingDto, ImportMockShopifyOrdersDto, ShopifyOAuthCallbackQueryDto } from './channel.dto';

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

  async startShopifyOAuth(tenantId: string, actorUserId: string, storeId: string, shopDomain: string) {
    this.requireOAuthConfig();
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId, channelType: ChannelType.SHOPIFY, isActive: true }, select: { id: true, name: true } });
    if (!store) throw new NotFoundException({ code: 'SHOPIFY_STORE_NOT_FOUND', message: '请选择一个启用中的 Shopify 店铺' });
    const shop = this.normalizeShopDomain(shopDomain);
    const state = await new SignJWT({ tenantId, storeId, actorUserId, nonce: randomBytes(16).toString('hex') })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('borderflow-shopify-oauth')
      .setAudience('borderflow-shopify')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(this.getSecret());
    const params = new URLSearchParams({ client_id: process.env.SHOPIFY_CLIENT_ID!, scope: process.env.SHOPIFY_SCOPES ?? 'read_products,read_orders,write_inventory', redirect_uri: process.env.SHOPIFY_REDIRECT_URI!, state });
    return { authorizationUrl: `https://${shop}/admin/oauth/authorize?${params.toString()}`, state, store, shopDomain: shop };
  }

  async completeShopifyOAuth(query: ShopifyOAuthCallbackQueryDto) {
    this.requireOAuthConfig();
    if (query.error) throw new BadRequestException({ code: 'SHOPIFY_OAUTH_DENIED', message: `Shopify 授权失败：${query.error}` });
    if (!query.code || !query.shop || !query.state) throw new BadRequestException({ code: 'SHOPIFY_OAUTH_INVALID_CALLBACK', message: 'Shopify 回调参数不完整' });
    const shop = this.normalizeShopDomain(query.shop);
    let statePayload: { tenantId?: string; storeId?: string; actorUserId?: string };
    try {
      const verified = await jwtVerify(query.state, this.getSecret(), { issuer: 'borderflow-shopify-oauth', audience: 'borderflow-shopify' });
      statePayload = verified.payload as typeof statePayload;
    } catch {
      throw new BadRequestException({ code: 'SHOPIFY_OAUTH_STATE_INVALID', message: 'Shopify 授权状态已失效，请重新发起连接' });
    }
    if (!statePayload.tenantId || !statePayload.storeId || !statePayload.actorUserId) throw new BadRequestException({ code: 'SHOPIFY_OAUTH_STATE_INVALID', message: 'Shopify 授权状态无效' });
    const store = await this.prisma.store.findFirst({ where: { id: statePayload.storeId, tenantId: statePayload.tenantId, channelType: ChannelType.SHOPIFY }, select: { id: true } });
    if (!store) throw new NotFoundException({ code: 'SHOPIFY_STORE_NOT_FOUND', message: '授权店铺不存在' });
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET, code: query.code }) });
    if (!response.ok) throw new BadRequestException({ code: 'SHOPIFY_TOKEN_EXCHANGE_FAILED', message: 'Shopify 授权码兑换失败' });
    const token = await response.json() as { access_token?: string; scope?: string };
    if (!token.access_token) throw new BadRequestException({ code: 'SHOPIFY_TOKEN_MISSING', message: 'Shopify 未返回访问令牌' });
    const connection = await this.prisma.channelConnection.upsert({
      where: { storeId_channelType: { storeId: store.id, channelType: ChannelType.SHOPIFY } },
      update: { tenantId: statePayload.tenantId, externalStoreId: shop, status: ConnectionStatus.CONNECTED, metadata: { accessToken: token.access_token, scope: token.scope ?? null, shopDomain: shop } },
      create: { tenantId: statePayload.tenantId, storeId: store.id, channelType: ChannelType.SHOPIFY, externalStoreId: shop, status: ConnectionStatus.CONNECTED, metadata: { accessToken: token.access_token, scope: token.scope ?? null, shopDomain: shop } },
    });
    await this.auditLogService.record(statePayload.tenantId, statePayload.actorUserId, 'SHOPIFY_CONNECTED', 'ChannelConnection', connection.id, { shopDomain: shop });
    return { connectionId: connection.id, storeId: store.id, shopDomain: shop, status: connection.status };
  }

  async handleShopifyWebhook(topic: string | undefined, shopHeader: string | undefined, hmacHeader: string | undefined, rawBody: Buffer | undefined) {
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET ?? process.env.SHOPIFY_CLIENT_SECRET;
    if (!secret) throw new BadRequestException({ code: 'SHOPIFY_WEBHOOK_NOT_CONFIGURED', message: '未配置 Shopify Webhook Secret' });
    if (!rawBody || !hmacHeader) throw new BadRequestException({ code: 'SHOPIFY_WEBHOOK_INVALID', message: 'Webhook 请求缺少签名或原始请求体' });
    const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(hmacHeader);
    if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) throw new BadRequestException({ code: 'SHOPIFY_WEBHOOK_SIGNATURE_INVALID', message: 'Webhook 签名校验失败' });
    if (!shopHeader) throw new BadRequestException({ code: 'SHOPIFY_WEBHOOK_SHOP_MISSING', message: 'Webhook 请求缺少店铺标识' });
    const shop = this.normalizeShopDomain(shopHeader);
    const connection = await this.prisma.channelConnection.findFirst({ where: { externalStoreId: shop, channelType: ChannelType.SHOPIFY }, select: { id: true, tenantId: true } });
    if (!connection) return { accepted: true, ignored: true, reason: 'CONNECTION_NOT_FOUND', topic, shopDomain: shop };
    if (topic?.startsWith('orders/')) {
      const payload = JSON.parse(rawBody.toString('utf8')) as { id?: string | number; name?: string; financial_status?: string; currency?: string; shipping_address?: { country_code?: string; country?: string }; line_items?: { sku?: string; quantity?: number; price?: string | number }[] };
      const actor = await this.prisma.user.findFirst({ where: { tenantId: connection.tenantId, role: 'ADMIN' }, select: { id: true } });
      const items = (payload.line_items ?? []).filter((item) => item.sku && Number(item.quantity) > 0).map((item) => ({ externalSku: item.sku!, quantity: Number(item.quantity), ...(item.price !== undefined ? { unitPrice: Number(item.price) } : {}) }));
      if (!payload.id || !items.length || !actor) return { accepted: true, ignored: true, reason: 'INVALID_ORDER_PAYLOAD', topic, shopDomain: shop };
      const result = await this.importMockShopifyOrders(connection.tenantId, actor.id, connection.id, { orders: [{ externalOrderId: String(payload.id), orderNo: payload.name?.replace(/^#/, ''), currency: this.toCurrency(payload.currency), shippingCountry: payload.shipping_address?.country_code ?? payload.shipping_address?.country ?? 'US', financialStatus: payload.financial_status === 'paid' ? 'paid' : 'pending', items }] });
      return { accepted: true, topic, shopDomain: shop, ...result };
    }
    const run = await this.prisma.channelSyncRun.create({ data: { connectionId: connection.id, status: SyncRunStatus.COMPLETED, totalItems: 1, successItems: 1, finishedAt: new Date(), logs: { create: { resource: 'WEBHOOK', resourceId: topic, status: 'SUCCESS', metadata: { topic, shopDomain: shop } } } } });
    await this.prisma.channelConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date() } });
    return { accepted: true, topic, shopDomain: shop, runId: run.id };
  }

  private async ensureShopifyConnection(tenantId: string, connectionId: string) {
    const connection = await this.prisma.channelConnection.findFirst({ where: { id: connectionId, tenantId }, include: { store: { select: { id: true, defaultCurrency: true, isActive: true } } } });
    if (!connection) throw new NotFoundException({ code: 'CHANNEL_CONNECTION_NOT_FOUND', message: '渠道连接不存在' });
    if (connection.channelType !== ChannelType.SHOPIFY) throw new BadRequestException({ code: 'CHANNEL_NOT_SHOPIFY', message: '当前连接不是 Shopify' });
    if (connection.status !== ConnectionStatus.CONNECTED) throw new BadRequestException({ code: 'CHANNEL_NOT_CONNECTED', message: 'Shopify 连接未就绪' });
    if (!connection.store.isActive) throw new BadRequestException({ code: 'STORE_INACTIVE', message: '店铺已停用' });
    return connection;
  }

  private requireOAuthConfig() {
    if (!process.env.SHOPIFY_CLIENT_ID || !process.env.SHOPIFY_CLIENT_SECRET || !process.env.SHOPIFY_REDIRECT_URI) throw new BadRequestException({ code: 'SHOPIFY_OAUTH_NOT_CONFIGURED', message: '未配置 Shopify OAuth 参数' });
  }

  private normalizeShopDomain(value: string) {
    const shop = value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) throw new BadRequestException({ code: 'SHOPIFY_SHOP_INVALID', message: 'Shopify 店铺域名格式不正确' });
    return shop;
  }

  private getSecret(): Uint8Array {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32 || secret === 'replace-with-a-long-development-secret') throw new Error('JWT_SECRET must be configured with at least 32 characters');
    return new TextEncoder().encode(secret);
  }

  private toCurrency(value?: string): Currency | undefined {
    return value && (value === Currency.USD || value === Currency.EUR || value === Currency.GBP || value === Currency.CNY) ? value : undefined;
  }
}
