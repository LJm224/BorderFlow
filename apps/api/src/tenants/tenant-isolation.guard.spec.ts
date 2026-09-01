import { describe, expect, test } from 'vitest';
import { TenantContext } from './tenant-context';
import { TenantIsolationGuard } from './tenant-isolation.guard';

function executionContext(request: Record<string, unknown>) {
  return { switchToHttp: () => ({ getRequest: () => request }) } as never;
}

describe('TenantIsolationGuard', () => {
  test('allows a request when any optional tenantId matches JWT context', () => {
    const request = { user: { tenantId: 'tenant-a' }, params: { tenantId: 'tenant-a' } };
    expect(new TenantIsolationGuard(new TenantContext()).canActivate(executionContext(request))).toBe(true);
  });

  test('rejects a cross-tenant tenantId supplied by the client', () => {
    const request = { user: { tenantId: 'tenant-a' }, body: { tenantId: 'tenant-b' } };
    expect(() => new TenantIsolationGuard(new TenantContext()).canActivate(executionContext(request))).toThrowError('无权访问其他商户的数据');
  });

  test('rejects requests without an authenticated user', () => {
    expect(() => new TenantIsolationGuard(new TenantContext()).canActivate(executionContext({}))).toThrowError('请先登录');
  });
});
