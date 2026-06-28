/**
 * SellerContext — Manages the currently logged-in seller
 * Auth via JWT. Token stored in sessionStorage (cleared on tab close).
 */
import { createContext, useContext, useState, useEffect } from 'react';
import api, { setToken } from '../utils/api';
import { useConfig } from './ConfigContext';

const SellerContext = createContext();

export function useSeller() {
  return useContext(SellerContext);
}

export function SellerProvider({ children }) {
  const { refresh: refreshConfig } = useConfig();
  const [currentSeller, setCurrentSeller] = useState(null);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const selectSeller = (seller, token) => {
    setToken(token);
    setCurrentSeller(seller);
    // Re-sincronizar la config (impresión, branding) por si el fetch de
    // arranque falló con el server aún iniciando.
    refreshConfig();
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* silencioso */ }
    setCurrentSeller(null);
    setToken(null);
  };

  const refreshSellers = async () => {
    const data = await api.get('/sellers');
    setSellers(data);
  };

  return (
    <SellerContext.Provider value={{
      currentSeller, sellers, selectSeller, logout, loading, refreshSellers
    }}>
      {children}
    </SellerContext.Provider>
  );
}
