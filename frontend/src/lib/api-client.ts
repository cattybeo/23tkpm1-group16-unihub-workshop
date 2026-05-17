import { getAuthToken } from './auth-store';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

async function fetcher<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  if (!(options.body instanceof File)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  
  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    throw { code: 'SERVER_ERROR', message: 'Backend không phản hồi JSON. Có thể server đã tắt.' };
  }

  const result = await response.json();
  if (!response.ok) {
    throw result.error || { code: 'AUTH_ERROR', message: 'Phiên làm việc hết hạn. Hãy đăng nhập lại.' };
  }

  return result.data;
}

export const api = {
  get: <T>(path: string) => fetcher<T>(path, { method: 'GET' }),
  post: <T>(path: string, body: any, headers?: any) => 
    fetcher<T>(path, { 
      method: 'POST', 
      body: body instanceof File ? body : JSON.stringify(body),
      headers 
    }),
};