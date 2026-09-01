import { describe, expect, beforeEach, test, vi } from 'vitest';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';

const tenant = { id: 'tenant-1', code: 'demo-shop', name: 'Demo Shop' };
const user = {
  id: 'user-1',
  tenantId: tenant.id,
  name: 'Demo Admin',
  email: 'admin@borderflow.dev',
  passwordHash: '$2a$10$RqxqE22L2uX9DQGuBaLjm.nSHISXQ1/PpjxD6rcvo0tBN0GyERvAe',
  role: UserRole.ADMIN,
  tenant,
};

describe('AuthService', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'unit-test-secret-that-is-long-enough';
    process.env.JWT_ACCESS_TTL = '15m';
  });

  test('logs in with tenant code and returns an access token plus refresh token', async () => {
    const prisma = fakePrisma();
    const service = new AuthService(prisma as never);

    const result = await service.login({ tenantCode: tenant.code, email: user.email, password: 'password' });

    expect(result.user).toEqual({ id: user.id, name: user.name, email: user.email, role: UserRole.ADMIN, tenant });
    expect(result.accessToken.split('.')).toHaveLength(3);
    expect(result.refreshToken).toHaveLength(43);
    expect(prisma.refreshSession.create).toHaveBeenCalledOnce();
  });

  test('does not disclose whether tenant or user exists', async () => {
    const prisma = fakePrisma();
    prisma.tenant.findUnique.mockResolvedValue(null);
    const service = new AuthService(prisma as never);

    await expect(service.login({ tenantCode: 'missing', email: 'missing@example.com', password: 'wrongpass' })).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test('verifies access token claims', async () => {
    const service = new AuthService(fakePrisma() as never);
    const token = (await service.login({ tenantCode: tenant.code, email: user.email, password: 'password' })).accessToken;

    await expect(service.verifyAccessToken(token)).resolves.toMatchObject({ sub: user.id, tenantId: tenant.id, role: UserRole.ADMIN });
  });

  test('rotates refresh tokens and revokes the previous session', async () => {
    const prisma = fakePrisma();
    const service = new AuthService(prisma as never);
    const first = await service.login({ tenantCode: tenant.code, email: user.email, password: 'password' });
    prisma.refreshSession.findUnique.mockResolvedValue({ id: 'session-1', userId: user.id, tokenHash: 'hash', expiresAt: new Date(Date.now() + 60_000), revokedAt: null, user, });

    const next = await service.refresh(first.refreshToken);

    expect(next.refreshToken).not.toBe(first.refreshToken);
    expect(prisma.refreshSession.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revokedAt: expect.any(Date) }) }));
    expect(prisma.refreshSession.create).toHaveBeenCalledTimes(2);
  });
});

function fakePrisma() {
  const prisma = {
    tenant: { findUnique: vi.fn().mockResolvedValue(tenant) },
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    refreshSession: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (callback: (transaction: typeof prisma) => Promise<unknown>) => callback(prisma)),
  };
  return prisma;
}
