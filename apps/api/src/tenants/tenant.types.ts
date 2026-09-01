import { AuthRequest } from '../auth/auth.types';

export interface TenantRequest extends AuthRequest {
  tenantId?: string;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

export interface TenantContextValue {
  tenantId: string;
}
