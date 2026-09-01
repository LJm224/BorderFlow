import { describe, expect, test, vi } from 'vitest';
import { UserRole } from '@prisma/client';
import { PermissionsGuard } from './permissions.guard';

function context(user: { role: UserRole } | undefined, required: string[] | undefined) {
  return {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never;
}

describe('PermissionsGuard', () => {
  test('allows an unprotected route', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    expect(new PermissionsGuard(reflector as never).canActivate(context(undefined, undefined))).toBe(true);
  });

  test('allows an admin to use every permission', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['user:manage']) };
    expect(new PermissionsGuard(reflector as never).canActivate(context({ role: UserRole.ADMIN }, ['user:manage']))).toBe(true);
  });

  test('rejects a role without the required permission', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['user:manage']) };
    expect(() => new PermissionsGuard(reflector as never).canActivate(context({ role: UserRole.OPERATOR }, ['user:manage']))).toThrowError(
      expect.objectContaining({ response: expect.objectContaining({ code: 'MISSING_PERMISSION' }) }),
    );
  });

  test('requires authentication for a protected route', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['dashboard:read']) };
    expect(() => new PermissionsGuard(reflector as never).canActivate(context(undefined, ['dashboard:read']))).toThrowError(
      expect.objectContaining({ response: expect.objectContaining({ code: 'UNAUTHORIZED' }) }),
    );
  });
});
