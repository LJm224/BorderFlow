import { UserRole } from '@prisma/client';

export const PERMISSIONS = [
  'product:read',
  'product:write',
  'product:approve',
  'ai:run',
  'order:read',
  'order:fulfill',
  'inventory:read',
  'inventory:write',
  'dashboard:read',
  'report:export',
  'user:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  OPERATOR: ['product:read', 'product:write', 'product:approve', 'ai:run', 'order:read', 'dashboard:read'],
  WAREHOUSE: ['order:read', 'order:fulfill', 'inventory:read', 'inventory:write', 'dashboard:read'],
  ANALYST: ['product:read', 'order:read', 'inventory:read', 'dashboard:read', 'report:export'],
};

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
