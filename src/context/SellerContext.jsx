/**
 * SellerContext — Manages the currently logged-in seller
 * Auth via JWT. Token stored in sessionStorage (cleared on tab close).
 */
import { createContext, useContext, useState, useEffect, useRef } from 'react';
import api, { setToken } from '../utils/api';
import { useConfig } from './ConfigContext';

const SellerContext = createContext();

// Cada cuánto se renueva el token, y cuánta inactividad lo deja morir. Renovar
// solo con actividad mantiene viva la jornada de trabajo sin dejar la caja
// abierta toda la noche para cualquiera que pase.
const REFRESH_EVERY_MS = 30 * 60 * 1000;
const IDLE_LIMIT_MS = 30 * 60 * 1000;

export function useSeller() {
  return useContext(SellerContext);
}

export function SellerProvider({ children }) {
  const { refresh: refreshConfig } = useConfig();
  const [currentSeller, setCurrentSeller] = useState(null);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const lastActivity = useRef(0);   // se inicializa al montar, no durante el render

  // Cargar vendedores activos para la pantalla de selección (endpoint público)
  useEffect(() => {
    api.get('/auth/sellers')
      .then(data => setSellers(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Restaurar sesión si hay token guardado
  useEffect(() => {
    const token = sessionStorage.getItem('authToken');
    if (!token) { setLoading(false); return; }
    api.get('/auth/me')
      .then(seller => { setCurrentSeller(seller); refreshConfig(); })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [refreshConfig]);

  // La sesión venció: api.js ya borró el token. Acá se cierra la sesión visible
  // para que la app vuelva a la pantalla de PIN en vez de quedar aparentemente
  // funcionando pero con todos los botones fallando.
  useEffect(() => {
    const onExpired = () => {
      setCurrentSeller(null);
      setSessionExpired(true);
    };
    window.addEventListener('session-expired', onExpired);
    return () => window.removeEventListener('session-expired', onExpired);
  }, []);

  // Renovación silenciosa mientras haya alguien trabajando.
  useEffect(() => {
    if (!currentSeller) return;
    const marcar = () => { lastActivity.current = Date.now(); };
    marcar();
    const eventos = ['click', 'keydown', 'touchstart'];
    eventos.forEach(e => window.addEventListener(e, marcar));
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_LIMIT_MS) return;
      api.post('/auth/refresh')
        .then(({ access_token }) => setToken(access_token))
        .catch(() => { /* si falla, el 401 de la próxima llamada hace su trabajo */ });
    }, REFRESH_EVERY_MS);
    return () => {
      eventos.forEach(e => window.removeEventListener(e, marcar));
      clearInterval(timer);
    };
  }, [currentSeller]);

  const selectSeller = (seller, token) => {
    setToken(token);
    setSessionExpired(false);
    setCurrentSeller(seller);
    // Re-sincronizar la config (impresión, branding) por si el fetch de
    // arranque falló con el server aún iniciando.
    refreshConfig();
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* silencioso */ }
    setCurrentSeller(null);
    setSessionExpired(false);
    setToken(null);
  };

  const refreshSellers = async () => {
    const data = await api.get('/sellers');
    setSellers(data);
  };

  // 'dev' es la cuenta de soporte del proveedor: cumple todo lo de admin.
  // Debe coincidir con require_admin del backend.
  const isAdmin = ['admin', 'dev'].includes(currentSeller?.role);

  return (
    <SellerContext.Provider value={{
      currentSeller, sellers, selectSeller, logout, loading, refreshSellers, isAdmin,
      sessionExpired
    }}>
      {children}
    </SellerContext.Provider>
  );
}
