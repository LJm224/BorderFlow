import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PinoLogger } from './pino.logger';

interface RequestLike {
  header(name: string): string | undefined;
  method: string;
  originalUrl: string;
  requestId?: string;
}

interface ResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): void;
  on(event: string, listener: () => void): void;
}

type NextFunction = () => void;

export interface RequestWithId extends RequestLike {
  requestId: string;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly logger: PinoLogger) {}

  use(request: RequestLike, response: ResponseLike, next: NextFunction): void {
    const requestId = this.getRequestId(request.header('x-request-id'));
    const requestWithId = request as RequestWithId;
    requestWithId.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    const startedAt = Date.now();

    response.on('finish', () => {
      this.logger.log(
        {
          event: 'http_request',
          requestId,
          method: request.method,
          path: request.originalUrl,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
        },
        'HTTP',
      );
    });

    next();
  }

  private getRequestId(candidate: string | undefined): string {
    if (candidate && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate)) return candidate;
    return randomUUID();
  }
}
