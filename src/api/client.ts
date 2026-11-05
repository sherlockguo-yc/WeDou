import type { Pattern } from '../core/types';

export interface User {
  id: string;
  username: string;
  createdAt: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'same-origin',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error ?? `请求失败 (${response.status})`) as Error & {
      status?: number;
      pattern?: Pattern;
    };
    error.status = response.status;
    error.pattern = body.pattern;
    throw error;
  }
  return body as T;
}

export const api = {
  me: () => request<{ user: User | null }>('/api/auth/me'),
  register: (username: string, password: string) =>
    request<{ user: User; recoveryCode: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  resetPassword: (username: string, recoveryCode: string, newPassword: string) =>
    request<{ user: User; recoveryCode: string }>('/api/auth/reset', {
      method: 'POST',
      body: JSON.stringify({ username, recoveryCode, newPassword }),
    }),
  login: (username: string, password: string) =>
    request<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  listPatterns: () => request<{ patterns: Pattern[] }>('/api/patterns'),
  savePattern: (pattern: Pattern) =>
    request<{ pattern: Pattern }>('/api/patterns', {
      method: 'POST',
      body: JSON.stringify({ pattern }),
    }),
  deletePattern: (id: string) =>
    request<{ ok: boolean }>(`/api/patterns/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
