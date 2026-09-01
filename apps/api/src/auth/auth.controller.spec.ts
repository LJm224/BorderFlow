import { describe, expect, test, vi } from 'vitest';
import { AuthController } from './auth.controller';
import { UserRole } from '@prisma/client';

describe('AuthController', () => {
  test('sets the refresh cookie on login without returning the refresh token', async () => {
    const authService = {
      login: vi.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: { id: 'user-1', name: 'Admin', email: 'admin@example.com', role: UserRole.ADMIN, tenant: { id: 'tenant-1', name: 'Demo', code: 'demo-shop' } },
      }),
      getRefreshCookieName: () => 'bf_refresh_token',
      getRefreshCookieMaxAge: () => 30 * 24 * 60 * 60 * 1000,
    };
    const response = { cookie: vi.fn(), clearCookie: vi.fn() };
    const controller = new AuthController(authService as never);

    const result = await controller.login({ tenantCode: 'demo-shop', email: 'admin@example.com', password: 'password' }, { headers: {} }, response);

    expect(result).not.toHaveProperty('refreshToken');
    expect(response.cookie).toHaveBeenCalledWith('bf_refresh_token', 'refresh-token', expect.objectContaining({ httpOnly: true, path: '/api/auth' }));
  });
});
