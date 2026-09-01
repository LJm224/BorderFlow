import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthRequest } from './auth.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const authorization = request.headers?.authorization;
    const token = Array.isArray(authorization) ? authorization[0] : authorization;
    if (!token?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '请先登录' });
    }

    const payload = await this.authService.verifyAccessToken(token.slice('Bearer '.length));
    const user = await this.authService.getPublicUserById(payload.sub);
    if (!user || user.tenant.id !== payload.tenantId) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '登录状态无效或已过期' });
    }
    request.user = { ...payload, tenantId: user.tenant.id, role: user.role };
    return true;
  }
}
