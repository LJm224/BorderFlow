import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CurrentTenantId } from '../tenants/current-tenant.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AccessTokenPayload } from '../auth/auth.types';
import { TenantIsolationGuard } from '../tenants/tenant-isolation.guard';
import { CreateStoreDto, CreateWarehouseDto, ListWarehousesQueryDto, UpdateStoreDto, UpdateWarehouseDto } from './store.dto';
import { StoreService } from './store.service';

@ApiTags('stores')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, TenantIsolationGuard, PermissionsGuard)
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get('stores')
  @RequirePermissions('store:read')
  listStores(@CurrentTenantId() tenantId: string) { return this.storeService.list(tenantId); }

  @Post('stores')
  @RequirePermissions('store:write')
  createStore(@CurrentTenantId() tenantId: string, @CurrentUser() user: AccessTokenPayload, @Body() dto: CreateStoreDto) { return this.storeService.createStore(tenantId, user.sub, dto); }

  @Patch('stores/:id')
  @RequirePermissions('store:write')
  updateStore(@CurrentTenantId() tenantId: string, @CurrentUser() user: AccessTokenPayload, @Param('id') storeId: string, @Body() dto: UpdateStoreDto) { return this.storeService.updateStore(tenantId, user.sub, storeId, dto); }

  @Get('warehouses')
  @RequirePermissions('store:read')
  listWarehouses(@CurrentTenantId() tenantId: string, @Query() query: ListWarehousesQueryDto) { return this.storeService.listWarehouses(tenantId, query); }

  @Post('warehouses')
  @RequirePermissions('store:write')
  createWarehouse(@CurrentTenantId() tenantId: string, @CurrentUser() user: AccessTokenPayload, @Body() dto: CreateWarehouseDto) { return this.storeService.createWarehouse(tenantId, user.sub, dto); }

  @Patch('warehouses/:id')
  @RequirePermissions('store:write')
  updateWarehouse(@CurrentTenantId() tenantId: string, @CurrentUser() user: AccessTokenPayload, @Param('id') warehouseId: string, @Body() dto: UpdateWarehouseDto) { return this.storeService.updateWarehouse(tenantId, user.sub, warehouseId, dto); }
}
