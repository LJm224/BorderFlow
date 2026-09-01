import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { TenantRequest } from './tenant.types';

@Injectable()
export class TenantContext {
  getTenantId(request: TenantRequest): string {
    const tenantId = request.user?.tenantId;
    if (!tenantId) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '请先登录' });
    request.tenantId = tenantId;
    return tenantId;
  }

  assertTenantAccess(currentTenantId: string, resourceTenantId: string): void {
    if (currentTenantId !== resourceTenantId) {
      throw new ForbiddenException({ code: 'TENANT_ACCESS_DENIED', message: '无权访问其他商户的数据' });
    }
  }
}
