import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiSuccess } from '@borderflow/shared';
import { RequestWithId } from './request-id.middleware';

@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, ApiSuccess<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccess<T>> {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const response = context.switchToHttp().getResponse();
    const requestId = request.requestId ?? response.getHeader('X-Request-Id') ?? 'unknown';

    return next.handle().pipe(
      map((data) => {
        if (this.isEnvelope(data)) return data;
        return { data, meta: { requestId: String(requestId) } };
      }),
    );
  }

  private isEnvelope(value: unknown): value is ApiSuccess<T> {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as { data?: unknown; meta?: { requestId?: unknown } };
    return 'data' in candidate && typeof candidate.meta?.requestId === 'string';
  }
}
