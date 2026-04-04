/**
 * Cliente HTTP central para la API FastAPI.
 * Maneja JWT automáticamente en cada request.
 */

const BASE_URL = '/api';

function getToken() {
  return sessionStorage.getItem('authToken');
}

export function setToken(token) {
  if (token) sessionStorage.setItem('authToken', token);
  else sessionStorage.removeItem('authToken');
}

async function request(method, path, body = undefined) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data?.detail || `Error ${res.status}`;
    throw new Error(Array.isArray(message) ? message.map(e => e.msg).join(', ') : message);
  }

  return data;
}

const api = {
  get:    (path)         => request('GET',    path),
  post:   (path, body)   => request('POST',   path, body),
  patch:  (path, body)   => request('PATCH',  path, body),
  delete: (path)         => request('DELETE', path),
};

export default api;
