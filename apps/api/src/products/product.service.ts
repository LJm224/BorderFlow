import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { tenantData, tenantWhere } from '../tenants/tenant-query.helper';
import { CreateProductDto, CreateSkuDto, ListProductsDto, UpdateProductDto, UpdateProductStatusDto, UpdateSkuDto } from './product.dto';
import { AuditLogService } from '../audit/audit.service';

const productListInclude = {
  skus: { orderBy: { skuCode: 'asc' as const } },
};
const productDetailInclude = {
  skus: {
    orderBy: { skuCode: 'asc' as const },
    include: {
      inventories: {
        orderBy: { warehouseId: 'asc' as const },
        include: { warehouse: { include: { store: { select: { id: true, name: true } } } } },
      },
    },
  },
  marketContents: { orderBy: [{ market: 'asc' as const }, { locale: 'asc' as const }] },
  media: { orderBy: { sortOrder: 'asc' as const } },
};

const productTransitions: Record<ProductStatus, readonly ProductStatus[]> = {
  DRAFT: [ProductStatus.PENDING_REVIEW],
  PENDING_REVIEW: [ProductStatus.DRAFT, ProductStatus.PUBLISHED],
  PUBLISHED: [ProductStatus.OFFLINE],
  OFFLINE: [ProductStatus.DRAFT, ProductStatus.PUBLISHED],
};

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly auditLogService?: AuditLogService) {}

  async list(tenantId: string, query: ListProductsDto) {
    const keyword = query.keyword?.trim();
    const where: Prisma.ProductWhereInput = tenantWhere(tenantId, keyword ? {
      OR: [
        { name: { contains: keyword, mode: 'insensitive' } },
        { skus: { some: { skuCode: { contains: keyword, mode: 'insensitive' } } } },
      ],
    } : {});
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, include: productListInclude, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.product.count({ where }),
    ]);
    return { items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  async getById(tenantId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId }, include: productDetailInclude });
    if (!product) throw this.notFound();
    return product;
  }

  async create(tenantId: string, dto: CreateProductDto, actorUserId?: string) {
    try {
      const product = await this.prisma.product.create({
        data: {
          ...tenantData(tenantId, { name: dto.name.trim(), description: dto.description, market: dto.market.toUpperCase(), currency: dto.currency }),
          skus: dto.skus?.length ? { create: dto.skus.map((sku) => this.skuData(sku)) } : undefined,
        },
        include: productDetailInclude,
      });
      await this.recordAudit(tenantId, actorUserId, 'PRODUCT_CREATED', 'Product', product.id, { name: product.name, market: product.market });
      return product;
    } catch (error) {
      this.throwConflict(error);
    }
  }

  async update(tenantId: string, productId: string, dto: UpdateProductDto, actorUserId?: string) {
    await this.requireProduct(tenantId, productId);
    try {
      const product = await this.prisma.product.update({ where: { id: productId }, data: { ...dto, ...(dto.name ? { name: dto.name.trim() } : {}), ...(dto.market ? { market: dto.market.toUpperCase() } : {}) }, include: productDetailInclude });
      await this.recordAudit(tenantId, actorUserId, 'PRODUCT_UPDATED', 'Product', productId, { changedFields: Object.keys(dto) });
      return product;
    } catch (error) {
      this.throwConflict(error);
    }
  }

  async updateStatus(tenantId: string, productId: string, dto: UpdateProductStatusDto, actorUserId?: string) {
    const current = await this.requireProduct(tenantId, productId);
    if (current.status === dto.status) return this.getById(tenantId, productId);
    if (!productTransitions[current.status].includes(dto.status)) {
      throw new BadRequestException({ code: 'INVALID_PRODUCT_TRANSITION', message: `商品不能从${current.status}变更为${dto.status}` });
    }
    const product = await this.prisma.product.update({ where: { id: productId }, data: { status: dto.status }, include: productDetailInclude });
    await this.recordAudit(tenantId, actorUserId, 'PRODUCT_STATUS_CHANGED', 'Product', productId, { fromStatus: current.status, toStatus: dto.status });
    return product;
  }

  async addSku(tenantId: string, productId: string, dto: CreateSkuDto, actorUserId?: string) {
    await this.requireProduct(tenantId, productId);
    try {
      const sku = await this.prisma.sku.create({ data: { productId, ...this.skuData(dto) } });
      await this.recordAudit(tenantId, actorUserId, 'SKU_CREATED', 'Sku', sku.id, { productId, skuCode: sku.skuCode });
      return sku;
    } catch (error) {
      this.throwConflict(error);
    }
  }

  async updateSku(tenantId: string, productId: string, skuId: string, dto: UpdateSkuDto, actorUserId?: string) {
    await this.requireProduct(tenantId, productId);
    const sku = await this.prisma.sku.findFirst({ where: { id: skuId, productId } });
    if (!sku) throw new NotFoundException({ code: 'SKU_NOT_FOUND', message: 'SKU 不存在' });
    try {
      const updated = await this.prisma.sku.update({ where: { id: skuId }, data: { ...dto, ...(dto.skuCode ? { skuCode: dto.skuCode.trim() } : {}) } });
      await this.recordAudit(tenantId, actorUserId, 'SKU_UPDATED', 'Sku', skuId, { productId, changedFields: Object.keys(dto) });
      return updated;
    } catch (error) {
      this.throwConflict(error);
    }
  }

  async deleteSku(tenantId: string, productId: string, skuId: string, actorUserId?: string): Promise<void> {
    await this.requireProduct(tenantId, productId);
    const sku = await this.prisma.sku.findFirst({ where: { id: skuId, productId }, select: { id: true, skuCode: true } });
    if (!sku) throw new NotFoundException({ code: 'SKU_NOT_FOUND', message: 'SKU 不存在' });
    const [orderItems, inventories] = await Promise.all([
      this.prisma.orderItem.count({ where: { skuId } }),
      this.prisma.inventory.count({ where: { skuId } }),
    ]);
    if (orderItems > 0 || inventories > 0) {
      throw new ConflictException({ code: 'SKU_IN_USE', message: 'SKU 已被订单或库存使用，不能删除' });
    }
    await this.prisma.sku.delete({ where: { id: skuId } });
    await this.recordAudit(tenantId, actorUserId, 'SKU_DELETED', 'Sku', skuId, { productId, skuCode: sku.skuCode });
  }

  private async requireProduct(tenantId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId }, select: { id: true, status: true } });
    if (!product) throw this.notFound();
    return product;
  }

  private skuData(sku: CreateSkuDto) {
    return { skuCode: sku.skuCode.trim(), variantName: sku.variantName.trim(), price: sku.price, costPrice: sku.costPrice, weight: sku.weight };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: '商品不存在' });
  }

  private throwConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException({ code: 'SKU_CODE_EXISTS', message: 'SKU 编码已存在' });
    }
    throw error;
  }

  private recordAudit(tenantId: string, actorUserId: string | undefined, action: string, resource: string, resourceId: string, metadata: Prisma.InputJsonValue): Promise<unknown> {
    if (!actorUserId || !this.auditLogService) return Promise.resolve();
    return this.auditLogService.record(tenantId, actorUserId, action, resource, resourceId, metadata);
  }
}
