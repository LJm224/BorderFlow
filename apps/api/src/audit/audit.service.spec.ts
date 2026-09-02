import { describe, expect, test, vi } from 'vitest';
import { AuditLogService } from './audit.service';

describe('AuditLogService', () => {
  test('lists only the current tenant and supports keyword filters', async () => {
    const prisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([{ id: 'audit-1', tenantId: 'tenant-1', action: 'PRODUCT_UPDATED' }]),
        count: vi.fn().mockResolvedValue(1),
        create: vi.fn(),
      },
    };
    const service = new AuditLogService(prisma as never);

    const result = await service.list('tenant-1', { keyword: 'product', page: 2, pageSize: 10 });

    expect(result.pagination).toEqual({ page: 2, pageSize: 10, total: 1, totalPages: 1 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10, where: expect.objectContaining({ tenantId: 'tenant-1', OR: expect.any(Array) }) }));
  });

  test('records a structured audit event', async () => {
    const prisma = { auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) } };
    const service = new AuditLogService(prisma as never);

    await service.record('tenant-1', 'user-1', 'INVENTORY_ADJUSTED', 'Inventory', 'inventory-1', { quantity: 2 });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId: 'tenant-1', userId: 'user-1', action: 'INVENTORY_ADJUSTED', resource: 'Inventory', resourceId: 'inventory-1', metadata: { quantity: 2 } }) });
  });
});
