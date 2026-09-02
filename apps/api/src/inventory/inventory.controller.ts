import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AccessTokenPayload } from '../auth/auth.types';
import { TenantIsolationGuard } from '../tenants/tenant-isolation.guard';
import { CurrentTenantId } from '../tenants/current-tenant.decorator';
import { AdjustInventoryDto, InitializeInventoryDto, ListInventoryDto, ListWarehousesDto } from './inventory.dto';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
@UseGuards(JwtAuthGuard, TenantIsolationGuard, PermissionsGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermissions('inventory:read')
  list(@CurrentTenantId() tenantId: string, @Query() query: ListInventoryDto) {
    return this.inventoryService.list(tenantId, query);
  }

  @Get('warehouses')
  @RequirePermissions('inventory:read')
  listWarehouses(@CurrentTenantId() tenantId: string, @Query() query: ListWarehousesDto) {
    return this.inventoryService.listWarehouses(tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('inventory:read')
  get(@CurrentTenantId() tenantId: string, @Param('id') inventoryId: string) {
    return this.inventoryService.getById(tenantId, inventoryId);
  }

  @Get(':id/transactions')
  @RequirePermissions('inventory:read')
  transactions(@CurrentTenantId() tenantId: string, @Param('id') inventoryId: string) {
    return this.inventoryService.listTransactions(tenantId, inventoryId);
  }

  @Patch('adjust')
  @RequirePermissions('inventory:write')
  adjust(@CurrentTenantId() tenantId: string, @CurrentUser() user: AccessTokenPayload, @Body() dto: AdjustInventoryDto) {
    return this.inventoryService.adjust(tenantId, user.sub, dto);
  }

  @Post('records')
  @RequirePermissions('inventory:write')
  initialize(@CurrentTenantId() tenantId: string, @CurrentUser() user: AccessTokenPayload, @Body() dto: InitializeInventoryDto) {
    return this.inventoryService.initialize(tenantId, user.sub, dto);
  }
}
