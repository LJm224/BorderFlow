import { describe, expect, test } from 'vitest';
import { tenantData, tenantWhere } from './tenant-query.helper';

describe('tenant query helpers', () => {
  test('always applies the tenant from server context', () => {
    expect(tenantWhere('tenant-a', { status: 'DRAFT' })).toEqual({ status: 'DRAFT', tenantId: 'tenant-a' });
    expect(tenantData('tenant-a', { tenantId: 'tenant-b', name: 'Draft' })).toEqual({ name: 'Draft', tenantId: 'tenant-a' });
  });
});
