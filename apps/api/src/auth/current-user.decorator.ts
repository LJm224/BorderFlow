import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthRequest, AccessTokenPayload } from './auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessTokenPayload => {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    return request.user as AccessTokenPayload;
  },
);
