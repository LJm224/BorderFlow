import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantIsolationGuard } from '../tenants/tenant-isolation.guard';
import { CurrentTenantId } from '../tenants/current-tenant.decorator';
import { AccessTokenPayload } from '../auth/auth.types';
import { CreateOrderDto, ListOrdersDto, UpdateOrderStatusDto } from './order.dto';
import { OrderService } from './order.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
@UseGuards(JwtAuthGuard, TenantIsolationGuard, PermissionsGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @RequirePermissions('order:read')
  list(@CurrentTenantId() tenantId: string, @Query() query: ListOrdersDto) {
    return this.orderService.list(tenantId, query);
  }

  @Post()
  @RequirePermissions('order:write')
  create(@CurrentTenantId() tenantId: string, @CurrentUser() user: AccessTokenPayload, @Body() dto: CreateOrderDto) {
    return this.orderService.create(tenantId, user.sub, dto);
  }

  @Get(':id')
  @RequirePermissions('order:read')
  get(@CurrentTenantId() tenantId: string, @Param('id') orderId: string) {
    return this.orderService.getById(tenantId, orderId);
  }

  @Patch(':id/status')
  @RequirePermissions('order:fulfill')
  updateStatus(@CurrentTenantId() tenantId: string, @Param('id') orderId: string, @CurrentUser() user: AccessTokenPayload, @Body() dto: UpdateOrderStatusDto) {
    return this.orderService.updateStatus(tenantId, orderId, user.sub, dto);
  }
}
