/**
 * SellerContext — Manages the currently logged-in seller
 * Persists seller ID in sessionStorage
 */
import { createContext, useContext, useState, useEffect } from 'react';
import db from '../db';
import { logAction, ACTIONS } from '../utils/auditLog';

const SellerContext = createContext();

export function useSeller() {
  return useContext(SellerContext);
}

export function SellerProvider({ children }) {
  const [currentSeller, setCurrentSeller] = useState(null);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSellers() {
      const allSellers = await db.sellers.toArray();
      setSellers(allSellers.filter(s => s.active !== false));
      
      // Restore session
      const savedId = sessionStorage.getItem('currentSellerId');
      if (savedId) {
        const seller = allSellers.find(s => s.id === parseInt(savedId));
        if (seller && seller.active !== false) {
          setCurrentSeller(seller);
        }
      }
      setLoading(false);
    }
    loadSellers();
  }, []);

  const selectSeller = (seller) => {
    setCurrentSeller(seller);
    sessionStorage.setItem('currentSellerId', seller.id.toString());
  };

  const logout = () => {
    if (currentSeller) {
      logAction(ACTIONS.LOGOUT, currentSeller.id, `${currentSeller.name} cerró sesión`);
    }
    setCurrentSeller(null);
    sessionStorage.removeItem('currentSellerId');
  };

  const refreshSellers = async () => {
    const allSellers = await db.sellers.toArray();
    setSellers(allSellers.filter(s => s.active !== false));
  };

  return (
    <SellerContext.Provider value={{
      currentSeller, sellers, selectSeller, logout, loading, refreshSellers
    }}>
      {children}
    </SellerContext.Provider>
  );
}
