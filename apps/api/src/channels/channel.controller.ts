import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CurrentTenantId } from '../tenants/current-tenant.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AccessTokenPayload } from '../auth/auth.types';
import { TenantIsolationGuard } from '../tenants/tenant-isolation.guard';
import { ChannelService } from './channel.service';
import { CreateChannelSkuMappingDto, ImportMockShopifyOrdersDto } from './channel.dto';

@ApiTags('channels')
@ApiBearerAuth()
@Controller('channel-connections')
@UseGuards(JwtAuthGuard, TenantIsolationGuard, PermissionsGuard)
export class ChannelController {
  constructor(private readonly channelService: ChannelService) {}

  @Get()
  @RequirePermissions('channel:read')
  list(@CurrentTenantId() tenantId: string) { return this.channelService.listConnections(tenantId); }

  @Post(':id/sku-mappings')
  @RequirePermissions('channel:write')
  mapSku(@CurrentTenantId() tenantId: string, @CurrentUser() user: AccessTokenPayload, @Param('id') connectionId: string, @Body() dto: CreateChannelSkuMappingDto) { return this.channelService.createSkuMapping(tenantId, user.sub, connectionId, dto); }

  @Post(':id/mock/import-orders')
  @RequirePermissions('channel:write')
  importOrders(@CurrentTenantId() tenantId: string, @CurrentUser() user: AccessTokenPayload, @Param('id') connectionId: string, @Body() dto: ImportMockShopifyOrdersDto) { return this.channelService.importMockShopifyOrders(tenantId, user.sub, connectionId, dto); }
}
