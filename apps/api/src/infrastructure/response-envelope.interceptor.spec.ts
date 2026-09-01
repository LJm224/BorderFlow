import { describe, expect, test } from 'vitest';
import { of } from 'rxjs';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';

function context(requestId = 'req-123') {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ requestId }),
      getResponse: () => ({ getHeader: () => requestId }),
    }),
  } as never;
}

describe('ResponseEnvelopeInterceptor', () => {
  test('wraps successful values and keeps requestId', async () => {
    const result = new ResponseEnvelopeInterceptor().intercept(context(), { handle: () => of({ status: 'ok' }) });
    await expect(result.toPromise()).resolves.toEqual({ data: { status: 'ok' }, meta: { requestId: 'req-123' } });
  });

  test('does not double-wrap an existing envelope', async () => {
    const value = { data: { status: 'ok' }, meta: { requestId: 'req-123' } };
    const result = new ResponseEnvelopeInterceptor().intercept(context(), { handle: () => of(value) });
    await expect(result.toPromise()).resolves.toBe(value);
  });
});
