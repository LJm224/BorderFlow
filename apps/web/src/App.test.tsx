import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { BrowserRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import App from './App';
import { resetAuthForTests, useAuthStore } from './auth';

vi.mock('./api', () => ({
  API_BASE_URL: 'http://localhost:3001/api',
  api: {
    defaults: { headers: { common: {} } },
    get: vi.fn().mockImplementation((path: string) => path === '/health'
      ? Promise.resolve({ data: { data: { status: 'ok' }, meta: { requestId: 'test-req' } } })
      : Promise.reject(new Error('not authenticated'))),
    post: vi.fn().mockRejectedValue(new Error('not authenticated')),
  },
}));

test('renders the login page when there is no session', async () => {
  resetAuthForTests();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>,
  );
  expect(await screen.findByText('登录 BorderFlow')).toBeInTheDocument();
  expect(screen.getByLabelText('商户编码')).toBeInTheDocument();
  expect(useAuthStore.getState().status).toBe('unauthenticated');
});
