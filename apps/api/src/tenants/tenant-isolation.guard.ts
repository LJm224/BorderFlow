import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { TenantContext } from './tenant-context';
import { TenantRequest } from './tenant.types';

@Injectable()
export class TenantIsolationGuard implements CanActivate {
  constructor(private readonly tenantContext: TenantContext) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    const tenantId = this.tenantContext.getTenantId(request);
    const requestedTenantId = this.findRequestedTenantId(request);
    if (requestedTenantId && requestedTenantId !== tenantId) {
      throw new ForbiddenException({ code: 'TENANT_ACCESS_DENIED', message: '无权访问其他商户的数据' });
    }
    request.tenantId = tenantId;
    return true;
  }

  private findRequestedTenantId(request: TenantRequest): string | undefined {
    const sources: Array<Record<string, unknown> | undefined> = [
      request.params as unknown as Record<string, unknown> | undefined,
      request.query as unknown as Record<string, unknown> | undefined,
      request.body as unknown as Record<string, unknown> | undefined,
    ];
    for (const source of sources) {
      const value = source?.tenantId;
      if (typeof value === 'string') return value;
    }
    return undefined;
  }
}
