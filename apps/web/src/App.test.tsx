import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { BrowserRouter } from 'react-router-dom';
import axios from 'axios';
import { expect, test, vi } from 'vitest';
import App from './App';

vi.mock('axios', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { data: { status: 'ok' }, meta: { requestId: 'test-req' } } }) },
}));

test('renders the BorderFlow shell', () => {
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
  expect(screen.getByText('BorderFlow')).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith('http://localhost:3001/api/health');
});
