import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { TenantRequest } from './tenant.types';

export const CurrentTenantId = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<TenantRequest>();
  const tenantId = request.user?.tenantId;
  if (!tenantId) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '请先登录' });
  return tenantId;
});
