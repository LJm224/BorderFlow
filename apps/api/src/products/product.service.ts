import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { tenantData, tenantWhere } from '../tenants/tenant-query.helper';
import { CreateProductDto, CreateSkuDto, ListProductsDto, UpdateProductDto, UpdateProductStatusDto, UpdateSkuDto } from './product.dto';

const productInclude = { skus: { orderBy: { skuCode: 'asc' as const } } } as const;

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: ListProductsDto) {
    const keyword = query.keyword?.trim();
    const where: Prisma.ProductWhereInput = tenantWhere(tenantId, keyword ? {
      OR: [
        { name: { contains: keyword, mode: 'insensitive' } },
        { skus: { some: { skuCode: { contains: keyword, mode: 'insensitive' } } } },
      ],
    } : {});
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, include: productInclude, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.product.count({ where }),
    ]);
    return { items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  async getById(tenantId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId }, include: productInclude });
    if (!product) throw this.notFound();
    return product;
  }

  async create(tenantId: string, dto: CreateProductDto) {
    try {
      return await this.prisma.product.create({
        data: {
          ...tenantData(tenantId, { name: dto.name.trim(), description: dto.description, market: dto.market.toUpperCase(), currency: dto.currency }),
          skus: dto.skus?.length ? { create: dto.skus.map((sku) => this.skuData(sku)) } : undefined,
        },
        include: productInclude,
      });
    } catch (error) {
      this.throwConflict(error);
    }
  }

  async update(tenantId: string, productId: string, dto: UpdateProductDto) {
    await this.requireProduct(tenantId, productId);
    try {
      return await this.prisma.product.update({ where: { id: productId }, data: { ...dto, ...(dto.name ? { name: dto.name.trim() } : {}), ...(dto.market ? { market: dto.market.toUpperCase() } : {}) }, include: productInclude });
    } catch (error) {
      this.throwConflict(error);
    }
  }

  async updateStatus(tenantId: string, productId: string, dto: UpdateProductStatusDto) {
    await this.requireProduct(tenantId, productId);
    return this.prisma.product.update({ where: { id: productId }, data: { status: dto.status }, include: productInclude });
  }

  async addSku(tenantId: string, productId: string, dto: CreateSkuDto) {
    await this.requireProduct(tenantId, productId);
    try {
      return await this.prisma.sku.create({ data: { productId, ...this.skuData(dto) } });
    } catch (error) {
      this.throwConflict(error);
    }
  }

  async updateSku(tenantId: string, productId: string, skuId: string, dto: UpdateSkuDto) {
    await this.requireProduct(tenantId, productId);
    const sku = await this.prisma.sku.findFirst({ where: { id: skuId, productId } });
    if (!sku) throw new NotFoundException({ code: 'SKU_NOT_FOUND', message: 'SKU 不存在' });
    try {
      return await this.prisma.sku.update({ where: { id: skuId }, data: dto });
    } catch (error) {
      this.throwConflict(error);
    }
  }

  private async requireProduct(tenantId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId }, select: { id: true } });
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
}
