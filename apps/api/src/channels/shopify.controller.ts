import { Controller, Get, Headers, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CurrentTenantId } from '../tenants/current-tenant.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AccessTokenPayload } from '../auth/auth.types';
import { TenantIsolationGuard } from '../tenants/tenant-isolation.guard';
import { ChannelService } from './channel.service';
import { ShopifyOAuthCallbackQueryDto, ShopifyOAuthStartQueryDto } from './channel.dto';

type RawBodyRequest = { rawBody?: Buffer };

@ApiTags('shopify')
@Controller()
export class ShopifyController {
  constructor(private readonly channelService: ChannelService) {}

  @Get('channel-connections/shopify/oauth/start')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantIsolationGuard, PermissionsGuard)
  @RequirePermissions('channel:write')
  startOAuth(@CurrentTenantId() tenantId: string, @CurrentUser() user: AccessTokenPayload, @Query() query: ShopifyOAuthStartQueryDto) {
    return this.channelService.startShopifyOAuth(tenantId, user.sub, query.storeId, query.shop);
  }

  @Get('channel-connections/shopify/oauth/callback')
  completeOAuth(@Query() query: ShopifyOAuthCallbackQueryDto) {
    return this.channelService.completeShopifyOAuth(query);
  }

  @Post('webhooks/shopify')
  webhook(@Headers('x-shopify-topic') topic: string | undefined, @Headers('x-shopify-shop-domain') shopDomain: string | undefined, @Headers('x-shopify-hmac-sha256') hmac: string | undefined, @Req() request: RawBodyRequest) {
    return this.channelService.handleShopifyWebhook(topic, shopDomain, hmac, request.rawBody);
  }
}
