import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentTenantId } from '../tenants/current-tenant.decorator';
import { TenantIsolationGuard } from '../tenants/tenant-isolation.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CreateProductDto, CreateSkuDto, ListProductsDto, UpdateProductDto, UpdateProductStatusDto, UpdateSkuDto } from './product.dto';
import { ProductService } from './product.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { AccessTokenPayload } from '../auth/auth.types';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
@UseGuards(JwtAuthGuard, TenantIsolationGuard, PermissionsGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @RequirePermissions('product:read')
  list(@CurrentTenantId() tenantId: string, @Query() query: ListProductsDto) {
    return this.productService.list(tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('product:read')
  get(@CurrentTenantId() tenantId: string, @Param('id') productId: string) {
    return this.productService.getById(tenantId, productId);
  }

  @Post()
  @RequirePermissions('product:write')
  create(@CurrentTenantId() tenantId: string, @CurrentUser() user: AccessTokenPayload, @Body() dto: CreateProductDto) {
    return this.productService.create(tenantId, dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions('product:write')
  update(@CurrentTenantId() tenantId: string, @Param('id') productId: string, @CurrentUser() user: AccessTokenPayload, @Body() dto: UpdateProductDto) {
    return this.productService.update(tenantId, productId, dto, user.sub);
  }

  @Patch(':id/status')
  @RequirePermissions('product:approve')
  updateStatus(@CurrentTenantId() tenantId: string, @Param('id') productId: string, @CurrentUser() user: AccessTokenPayload, @Body() dto: UpdateProductStatusDto) {
    return this.productService.updateStatus(tenantId, productId, dto, user.sub);
  }

  @Post(':id/skus')
  @RequirePermissions('product:write')
  addSku(@CurrentTenantId() tenantId: string, @Param('id') productId: string, @CurrentUser() user: AccessTokenPayload, @Body() dto: CreateSkuDto) {
    return this.productService.addSku(tenantId, productId, dto, user.sub);
  }

  @Patch(':id/skus/:skuId')
  @RequirePermissions('product:write')
  updateSku(@CurrentTenantId() tenantId: string, @Param('id') productId: string, @Param('skuId') skuId: string, @CurrentUser() user: AccessTokenPayload, @Body() dto: UpdateSkuDto) {
    return this.productService.updateSku(tenantId, productId, skuId, dto, user.sub);
  }

  @Delete(':id/skus/:skuId')
  @RequirePermissions('product:write')
  async deleteSku(@CurrentTenantId() tenantId: string, @Param('id') productId: string, @Param('skuId') skuId: string, @CurrentUser() user: AccessTokenPayload) {
    await this.productService.deleteSku(tenantId, productId, skuId, user.sub);
    return { success: true };
  }
}
