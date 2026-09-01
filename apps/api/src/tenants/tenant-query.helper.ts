export function tenantWhere<T extends object>(tenantId: string, where?: T): T & { tenantId: string } {
  return { ...(where ?? {}), tenantId } as T & { tenantId: string };
}

export function tenantData<T extends object>(tenantId: string, data: T): Omit<T, 'tenantId'> & { tenantId: string } {
  const sanitized = { ...data } as Omit<T, 'tenantId'> & { tenantId?: unknown };
  delete sanitized.tenantId;
  return { ...sanitized, tenantId } as Omit<T, 'tenantId'> & { tenantId: string };
}
