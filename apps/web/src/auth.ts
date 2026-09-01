import { create } from 'zustand';
import { api } from './api';
import { ApiSuccess } from '@borderflow/shared';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'OPERATOR' | 'WAREHOUSE' | 'ANALYST';
  tenant: { id: string; name: string; code: string };
}

interface AuthPayload {
  accessToken: string;
  user: AuthUser;
}

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: AuthUser | null;
  bootstrap: () => Promise<void>;
  login: (input: { tenantCode: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const ACCESS_TOKEN_KEY = 'borderflow.access_token';

function readAccessToken(): string | null {
  return typeof window === 'undefined' ? null : window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

function saveSession(payload: AuthPayload): void {
  window.sessionStorage.setItem(ACCESS_TOKEN_KEY, payload.accessToken);
  api.defaults.headers.common.Authorization = `Bearer ${payload.accessToken}`;
}

function clearSession(): void {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  delete api.defaults.headers.common.Authorization;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  accessToken: null,
  user: null,

  bootstrap: async () => {
    set({ status: 'loading' });
    const token = readAccessToken();
    if (token) {
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
      try {
        const response = await api.get<ApiSuccess<AuthUser>>('/auth/me');
        set({ status: 'authenticated', accessToken: token, user: response.data.data });
        return;
      } catch {
        clearSession();
      }
    }

    try {
      const response = await api.post<ApiSuccess<AuthPayload>>('/auth/refresh');
      saveSession(response.data.data);
      set({ status: 'authenticated', accessToken: response.data.data.accessToken, user: response.data.data.user });
    } catch {
      clearSession();
      set({ status: 'unauthenticated', accessToken: null, user: null });
    }
  },

  login: async (input) => {
    const response = await api.post<ApiSuccess<AuthPayload>>('/auth/login', input);
    saveSession(response.data.data);
    set({ status: 'authenticated', accessToken: response.data.data.accessToken, user: response.data.data.user });
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      clearSession();
      set({ status: 'unauthenticated', accessToken: null, user: null });
    }
  },
}));

export function resetAuthForTests(): void {
  clearSession();
  useAuthStore.setState({ status: 'loading', accessToken: null, user: null });
}
