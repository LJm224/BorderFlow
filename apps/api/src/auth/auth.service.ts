import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UserRole } from '@prisma/client';
import { compare } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { AccessTokenPayload, AuthenticatedUser, SessionResult } from './auth.types';
import { LoginDto } from './auth.dto';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_COOKIE_NAME = 'bf_refresh_token';
const ISSUER = 'borderflow-api';
const AUDIENCE = 'borderflow-web';
const DUMMY_PASSWORD_HASH = '$2a$10$RqxqE22L2uX9DQGuBaLjm.nSHISXQ1/PpjxD6rcvo0tBN0GyERvAe';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(dto: LoginDto, userAgent?: string, ipAddress?: string): Promise<SessionResult> {
    const tenant = await this.prisma.tenant.findUnique({ where: { code: dto.tenantCode } });
    const user = tenant
      ? await this.prisma.user.findUnique({
          where: { tenantId_email: { tenantId: tenant.id, email: dto.email.toLowerCase() } },
          include: { tenant: true },
        })
      : null;
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordMatches = await compare(dto.password, passwordHash);
    if (!tenant || !user || !passwordMatches) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: '邮箱、商户编码或密码错误' });
    }

    return this.issueSession(user, userAgent, ipAddress);
  }

  async refresh(refreshToken: string | undefined, userAgent?: string, ipAddress?: string): Promise<SessionResult> {
    if (!refreshToken) throw this.invalidRefreshToken();
    const tokenHash = this.hashRefreshToken(refreshToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: { user: { include: { tenant: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw this.invalidRefreshToken();
    }

    const nextToken = this.createRefreshToken();
    const nextTokenHash = this.hashRefreshToken(nextToken);
    const nextExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.refreshSession.update({ where: { id: session.id }, data: { revokedAt: new Date(), lastUsedAt: new Date() } });
      await transaction.refreshSession.create({
        data: {
          userId: session.userId,
          tokenHash: nextTokenHash,
          expiresAt: nextExpiresAt,
          userAgent,
          ipAddress,
        },
      });
    });

    const accessToken = await this.signAccessToken(session.user.id, session.user.tenantId, session.user.role);
    return { accessToken, user: this.toPublicUser(session.user), refreshToken: nextToken };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.refreshSession.updateMany({
      where: { tokenHash: this.hashRefreshToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const { payload } = await jwtVerify(token, this.getSecret(), { issuer: ISSUER, audience: AUDIENCE });
      if (typeof payload.sub !== 'string' || typeof payload.tenantId !== 'string' || !this.isRole(payload.role)) {
        throw new Error('Invalid token claims');
      }
      return { sub: payload.sub, tenantId: payload.tenantId, role: payload.role, iat: payload.iat, exp: payload.exp, iss: payload.iss, aud: payload.aud };
    } catch {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '登录状态无效或已过期' });
    }
  }

  async getPublicUserById(userId: string): Promise<AuthenticatedUser | undefined> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { tenant: true } });
    return user ? this.toPublicUser(user) : undefined;
  }

  getRefreshCookieName(): string {
    return REFRESH_COOKIE_NAME;
  }

  getRefreshCookieMaxAge(): number {
    return REFRESH_TOKEN_TTL_MS;
  }

  private async issueSession(user: { id: string; tenantId: string; role: UserRole; name: string; email: string; tenant: { id: string; name: string; code: string } }, userAgent?: string, ipAddress?: string): Promise<SessionResult> {
    const refreshToken = this.createRefreshToken();
    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: this.hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        userAgent,
        ipAddress,
      },
    });
    return { accessToken: await this.signAccessToken(user.id, user.tenantId, user.role), user: this.toPublicUser(user), refreshToken };
  }

  private async signAccessToken(userId: string, tenantId: string, role: UserRole): Promise<string> {
    return new SignJWT({ tenantId, role })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(process.env.JWT_ACCESS_TTL ?? '15m')
      .sign(this.getSecret());
  }

  private getSecret(): Uint8Array {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32 || secret === 'replace-with-a-long-development-secret') throw new Error('JWT_SECRET must be configured with at least 32 characters');
    return new TextEncoder().encode(secret);
  }

  private createRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException({ code: 'INVALID_REFRESH_TOKEN', message: '刷新会话无效或已过期' });
  }

  private isRole(value: unknown): value is UserRole {
    return value === UserRole.ADMIN || value === UserRole.OPERATOR || value === UserRole.WAREHOUSE || value === UserRole.ANALYST;
  }

  private toPublicUser(user: { id: string; name: string; email: string; role: UserRole; tenant: { id: string; name: string; code: string } }): AuthenticatedUser {
    return { id: user.id, name: user.name, email: user.email, role: user.role, tenant: { id: user.tenant.id, name: user.tenant.name, code: user.tenant.code } };
  }
}
