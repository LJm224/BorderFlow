import { describe, expect, test, vi } from 'vitest';
import { Currency, ProductStatus } from '@prisma/client';
import { ProductService } from './product.service';

const product = { id: 'product-1', tenantId: 'tenant-1', name: 'Backpack', description: 'Demo', market: 'US', currency: Currency.USD, status: ProductStatus.DRAFT, skus: [] };

function fakePrisma() {
  return {
    product: {
      findMany: vi.fn().mockResolvedValue([product]),
      count: vi.fn().mockResolvedValue(1),
      findFirst: vi.fn().mockResolvedValue(product),
      create: vi.fn().mockResolvedValue(product),
      update: vi.fn().mockResolvedValue(product),
    },
    sku: {
      create: vi.fn().mockResolvedValue({ id: 'sku-1', productId: product.id, skuCode: 'BF-1' }),
      findFirst: vi.fn().mockResolvedValue({ id: 'sku-1', productId: product.id }),
      update: vi.fn().mockResolvedValue({ id: 'sku-1', productId: product.id }),
    },
    $transaction: vi.fn().mockResolvedValue([[product], 1]),
  };
}

describe('ProductService', () => {
  test('lists products with tenant scope, keyword and pagination', async () => {
    const prisma = fakePrisma();
    const service = new ProductService(prisma as never);

    const result = await service.list('tenant-1', { keyword: 'bag', page: 2, pageSize: 10 });

    expect(result.pagination).toEqual({ page: 2, pageSize: 10, total: 1, totalPages: 1 });
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10, where: expect.objectContaining({ tenantId: 'tenant-1', OR: expect.any(Array) }) }));
    expect(prisma.product.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1' }) }));
  });

  test('injects the server tenant when creating a product', async () => {
    const prisma = fakePrisma();
    const service = new ProductService(prisma as never);

    await service.create('tenant-1', { name: 'New product', description: '', market: 'us', currency: Currency.USD, skus: [] });

    expect(prisma.product.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-1', market: 'US' }) }));
  });

  test('does not expose a product from another tenant', async () => {
    const prisma = fakePrisma();
    prisma.product.findFirst.mockResolvedValue(null);
    const service = new ProductService(prisma as never);

    await expect(service.getById('tenant-2', product.id)).rejects.toMatchObject({ response: { code: 'PRODUCT_NOT_FOUND' } });
    expect(prisma.product.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: product.id, tenantId: 'tenant-2' } }));
  });
});
