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

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // El servidor no responde (caído, sin red, etc.)
    window.dispatchEvent(new CustomEvent('server-status', { detail: { online: false } }));
    throw new Error('Sin conexión con el servidor');
  }

  // El servidor respondió. Un 5xx NO cuenta como sano: cuando el pool de la base
  // se agota, todo responde 500 y anunciar "online" acá borraba el banner que el
  // latido de /api/health acababa de encender. Se deja que el latido decida.
  if (res.status < 500) {
    window.dispatchEvent(new CustomEvent('server-status', { detail: { online: true } }));
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));

  // Sesión vencida. Sin esto el token muerto se quedaba en sessionStorage, la
  // pantalla seguía mostrando a la cajera con su nombre arriba y TODO fallaba con
  // un "Token inválido" que no significa nada: parecía que la app se había caído.
  // El único arreglo desde el mesón era cerrar sesión y volver a entrar.
  if (res.status === 401 && !path.startsWith('/auth/')) {
    setToken(null);
    window.dispatchEvent(new CustomEvent('session-expired'));
    throw new Error('Tu sesión expiró. Ingresá tu PIN para continuar.');
  }

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

/**
 * POST con progreso de subida. Usa XHR porque fetch no expone el avance del upload;
 * el resto del contrato (token, errores, evento server-status) es igual a request().
 * onProgress recibe 0..1, o null cuando el navegador no sabe el tamaño total.
 */
function postWithProgress(path, body, { onProgress, timeoutMs = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}${path}`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.timeout = timeoutMs;

    xhr.upload.onprogress = (e) => {
      if (onProgress) onProgress(e.lengthComputable ? e.loaded / e.total : null);
    };
    // En localhost la subida puede terminar sin un onprogress final: sin esto la
    // barra se quedaría clavada mientras el servidor ya está procesando.
    xhr.upload.onload = () => { if (onProgress) onProgress(1); };

    xhr.onload = () => {
      // Mismo criterio que en request(): un 5xx no prueba que el servidor esté sano.
      if (xhr.status < 500) {
        window.dispatchEvent(new CustomEvent('server-status', { detail: { online: true } }));
      }
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* respuesta vacía o no JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) { resolve(xhr.status === 204 ? null : data); return; }

      const detail = data?.detail;
      let message;
      if (typeof detail === 'string') message = detail;
      else if (Array.isArray(detail)) message = detail.map(e => e.msg).join(', ');
      else if (detail && typeof detail === 'object') message = detail.message || `Error ${xhr.status}`;
      else message = `Error ${xhr.status}`;
      const err = new Error(message);
      err.status = xhr.status;
      err.data = data;
      reject(err);
    };

    const fail = (msg) => {
      window.dispatchEvent(new CustomEvent('server-status', { detail: { online: false } }));
      reject(new Error(msg));
    };
    xhr.onerror = () => fail('Sin conexión con el servidor');
    xhr.ontimeout = () => fail('El servidor tardó demasiado en responder');

    xhr.send(JSON.stringify(body));
  });
}

const api = {
  get:    (path)         => request('GET',    path),
  postWithProgress,
  post:   (path, body)   => request('POST',   path, body),
  put:    (path, body)   => request('PUT',    path, body),
  patch:  (path, body)   => request('PATCH',  path, body),
  delete: (path)         => request('DELETE', path),
};

export default api;
