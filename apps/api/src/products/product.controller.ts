import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentTenantId } from '../tenants/current-tenant.decorator';
import { TenantIsolationGuard } from '../tenants/tenant-isolation.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CreateProductDto, CreateSkuDto, ListProductsDto, UpdateProductDto, UpdateProductStatusDto, UpdateSkuDto } from './product.dto';
import { ProductService } from './product.service';

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
  create(@CurrentTenantId() tenantId: string, @Body() dto: CreateProductDto) {
    return this.productService.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions('product:write')
  update(@CurrentTenantId() tenantId: string, @Param('id') productId: string, @Body() dto: UpdateProductDto) {
    return this.productService.update(tenantId, productId, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('product:approve')
  updateStatus(@CurrentTenantId() tenantId: string, @Param('id') productId: string, @Body() dto: UpdateProductStatusDto) {
    return this.productService.updateStatus(tenantId, productId, dto);
  }

  @Post(':id/skus')
  @RequirePermissions('product:write')
  addSku(@CurrentTenantId() tenantId: string, @Param('id') productId: string, @Body() dto: CreateSkuDto) {
    return this.productService.addSku(tenantId, productId, dto);
  }

  @Patch(':id/skus/:skuId')
  @RequirePermissions('product:write')
  updateSku(@CurrentTenantId() tenantId: string, @Param('id') productId: string, @Param('skuId') skuId: string, @Body() dto: UpdateSkuDto) {
    return this.productService.updateSku(tenantId, productId, skuId, dto);
  }
}
