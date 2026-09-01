import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiError } from '@borderflow/shared';
import { PinoLogger } from './pino.logger';
import { RequestWithId } from './request-id.middleware';

interface ResponseLike {
  status(statusCode: number): { json(body: unknown): void };
  getHeader(name: string): string | number | string[] | undefined;
}

const STATUS_CODES: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_ERROR',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<ResponseLike>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = request.requestId ?? String(response.getHeader('X-Request-Id') ?? 'unknown');
    const details = this.getDetails(exception);
    const body: ApiError = {
      error: {
        code: this.getCode(exception, status),
        message: this.getMessage(exception, status),
        requestId,
        ...(details ? { details } : {}),
      },
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception instanceof Error ? exception : body, exception instanceof Error ? exception.stack : undefined, 'HTTP');
    }
    response.status(status).json(body);
  }

  private getResponse(exception: unknown): Record<string, unknown> | undefined {
    if (!(exception instanceof HttpException)) return undefined;
    const value = exception.getResponse();
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
  }

  private getCode(exception: unknown, status: HttpStatus): string {
    const response = this.getResponse(exception);
    return typeof response?.code === 'string' ? response.code : STATUS_CODES[status] ?? `HTTP_${status}`;
  }

  private getMessage(exception: unknown, status: HttpStatus): string {
    const response = this.getResponse(exception);
    if (typeof response?.message === 'string') return response.message;
    if (Array.isArray(response?.message)) return '请求参数校验失败';
    if (exception instanceof HttpException && typeof exception.message === 'string') return exception.message;
    return status >= HttpStatus.INTERNAL_SERVER_ERROR ? '服务器内部错误' : '请求失败';
  }

  private getDetails(exception: unknown): Record<string, unknown> | undefined {
    const response = this.getResponse(exception);
    if (Array.isArray(response?.message)) return { validation: response.message };
    return response?.details && typeof response.details === 'object' ? response.details as Record<string, unknown> : undefined;
  }
}
