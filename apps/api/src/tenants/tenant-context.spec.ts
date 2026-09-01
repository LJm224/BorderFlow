import { describe, expect, test } from 'vitest';
import { UserRole } from '@prisma/client';
import { TenantContext } from './tenant-context';
import { TenantRequest } from './tenant.types';

describe('TenantContext', () => {
  test('reads tenantId from the authenticated JWT context', () => {
    const request = { user: { tenantId: 'tenant-a', sub: 'user-a', role: UserRole.ADMIN } } as TenantRequest;
    const context = new TenantContext();

    expect(context.getTenantId(request)).toBe('tenant-a');
    expect(request.tenantId).toBe('tenant-a');
  });

  test('rejects a resource belonging to another tenant', () => {
    expect(() => new TenantContext().assertTenantAccess('tenant-a', 'tenant-b')).toThrowError('无权访问其他商户的数据');
  });
});
