import { clearAuth, getAuthToken, setAuth } from './auth-store';
import type { User } from '@supabase/supabase-js';

function normalizeApiUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, '');
  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/.test(trimmed)
  ) {
    return '/api/v1';
  }
  if (trimmed === '/api') return '/api/v1';
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`;
}

const API_URL = normalizeApiUrl(import.meta.env.VITE_API_URL || '/api');

interface RefreshResult {
  access_token: string;
  user: User;
  profile: unknown;
}

let inFlightRefresh: Promise<RefreshResult | null> | null = null;

const REFRESHABLE_AUTH_CODES = new Set(['TOKEN_EXPIRED', 'UNAUTHENTICATED', 'INVALID_TOKEN']);

function canRefreshAfterAuthError(path: string, status: number, code: string): boolean {
  if (status !== 401 || !REFRESHABLE_AUTH_CODES.has(code)) return false;
  return path !== '/auth/login' && path !== '/auth/refresh';
}

async function callRefresh(): Promise<RefreshResult | null> {
  if (inFlightRefresh) return inFlightRefresh;
  inFlightRefresh = (async () => {
    try {
      const r = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!r.ok) return null;
      const result = await r.json();
      const { session, user, profile } = result.data ?? {};
      if (!session?.access_token || !user) return null;
      setAuth(user, session.access_token);
      return { access_token: session.access_token, user, profile };
    } catch {
      return null;
    } finally {
      queueMicrotask(() => { inFlightRefresh = null; });
    }
  })();
  return inFlightRefresh;
}

async function fetcher<T>(path: string, options: RequestInit = {}, _retried = false): Promise<T> {
  const token = getAuthToken();

  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!(options.body instanceof File)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw { code: 'SERVER_ERROR', message: 'Backend không phản hồi JSON. Có thể server đã tắt.' };
  }

  const result = await response.json();
  if (!response.ok) {
    const err = result.error || { code: 'AUTH_ERROR', message: 'Phiên làm việc hết hạn. Hãy đăng nhập lại.' };

    if (!_retried && canRefreshAfterAuthError(path, response.status, err.code)) {
      const refreshed = await callRefresh();
      if (refreshed) return fetcher<T>(path, options, true);
      clearAuth();
    }

    throw err;
  }

  return result.data;
}

export const api = {
  get: <T>(path: string) => fetcher<T>(path, { method: 'GET' }),
  post: <T>(path: string, body: unknown, headers?: Record<string, string>) =>
    fetcher<T>(path, {
      method: 'POST',
      body: body instanceof File ? body : JSON.stringify(body),
      headers,
    }),
  patch: <T>(path: string, body: unknown) =>
    fetcher<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) =>
    fetcher<T>(path, { method: 'DELETE' }),
  refresh: () => callRefresh(),
};
