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
    const detail = data?.detail;
    let message;
    if (typeof detail === 'string') {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = detail.map(e => e.msg).join(', ');
    } else if (detail && typeof detail === 'object') {
      message = detail.message || `Error ${res.status}`;
    } else {
      message = `Error ${res.status}`;
    }
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
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
