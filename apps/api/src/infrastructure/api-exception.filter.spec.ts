import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { describe, expect, test, vi } from 'vitest';
import { ApiExceptionFilter } from './api-exception.filter';

describe('ApiExceptionFilter', () => {
  test('returns the stable validation error contract', () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const filter = new ApiExceptionFilter({ error: vi.fn() } as never);
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ requestId: 'req-1' }),
        getResponse: () => ({ status, getHeader: () => 'req-1' }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new BadRequestException({ message: ['email must be an email'] }), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'BAD_REQUEST',
        message: '请求参数校验失败',
        requestId: 'req-1',
        details: { validation: ['email must be an email'] },
      },
    });
  });
});
