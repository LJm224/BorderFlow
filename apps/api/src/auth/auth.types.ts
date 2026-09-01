import { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  tenant: {
    id: string;
    name: string;
    code: string;
  };
}

export interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

export interface AuthRequest {
  headers?: Record<string, string | string[] | undefined>;
  user?: AccessTokenPayload;
}

export interface AuthResponse {
  cookie(name: string, value: string, options: CookieOptions): void;
  clearCookie(name: string, options: CookieOptions): void;
}

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  maxAge?: number;
}

export interface LoginResult {
  accessToken: string;
  user: AuthenticatedUser;
}

export interface SessionResult extends LoginResult {
  refreshToken: string;
}
