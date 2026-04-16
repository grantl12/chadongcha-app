import { usePlayerStore } from '@/stores/playerStore';

// export const API_BASE_URL = 'http://localhost:8000'; // dev
export const API_BASE_URL = 'https://chadongcha-production.up.railway.app'; // prod

async function request(method: string, path: string, body?: unknown) {
  const token = usePlayerStore.getState().accessToken;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${method} ${path} → ${res.status}: ${text}`);
  }

  return res.json();
}

export const apiClient = {
  get:    (path: string)                => request('GET',    path),
  post:   (path: string, body: unknown) => request('POST',   path, body),
  patch:  (path: string, body: unknown) => request('PATCH',  path, body),
  delete: (path: string)                => request('DELETE', path),
};
