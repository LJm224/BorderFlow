import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthRequest } from './auth.types';
import { Permission, roleHasPermission } from './permissions';
import { REQUIRED_PERMISSIONS_KEY } from './require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const user = request.user;
    if (!user) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '请先登录' });

    const missing = required.filter((permission) => !roleHasPermission(user.role, permission));
    if (missing.length > 0) {
      throw new ForbiddenException({ code: 'MISSING_PERMISSION', message: '当前角色没有执行此操作的权限', details: { permissions: missing } });
    }
    return true;
  }
}
