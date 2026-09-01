import { describe, expect, test, vi } from 'vitest';
import { RequestIdMiddleware } from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  test('propagates a safe incoming request id', () => {
    const logger = { log: vi.fn() };
    const middleware = new RequestIdMiddleware(logger as never);
    const request = { header: () => 'client-request-1', method: 'GET', originalUrl: '/api/health' };
    const response = { setHeader: vi.fn(), on: vi.fn(), statusCode: 200 };
    const next = vi.fn();

    middleware.use(request as never, response as never, next);

    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', 'client-request-1');
    expect((request as { requestId?: string }).requestId).toBe('client-request-1');
    expect(next).toHaveBeenCalledOnce();
  });

  test('generates a request id when the incoming value is unsafe', () => {
    const logger = { log: vi.fn() };
    const middleware = new RequestIdMiddleware(logger as never);
    const request = { header: () => 'bad id with spaces', method: 'GET', originalUrl: '/api/health' };
    const response = { setHeader: vi.fn(), on: vi.fn(), statusCode: 200 };

    middleware.use(request as never, response as never, vi.fn());

    const requestId = response.setHeader.mock.calls[0][1] as string;
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
