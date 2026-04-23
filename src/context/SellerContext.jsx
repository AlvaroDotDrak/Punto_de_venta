/**
 * SellerContext — Manages the currently logged-in seller
 * Auth via JWT. Token stored in sessionStorage (cleared on tab close).
 */
import { createContext, useContext, useState, useEffect } from 'react';
import api, { setToken } from '../utils/api';

const SellerContext = createContext();

export function useSeller() {
  return useContext(SellerContext);
}

export function SellerProvider({ children }) {
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
      .then(seller => setCurrentSeller(seller))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const selectSeller = (seller, token) => {
    setToken(token);
    setCurrentSeller(seller);
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
