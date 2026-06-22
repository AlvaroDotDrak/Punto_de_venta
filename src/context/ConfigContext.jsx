/**
 * ConfigContext — Configuración del rubro (multi-vertical).
 * Carga GET /config/profile al boot (endpoint público, antes del login) y expone
 * capabilities, branding, categorías y terminología a toda la app.
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { DEFAULT_PROFILE, hexToRgba } from '../utils/verticals';

const ConfigContext = createContext();

export function useConfig() {
  return useContext(ConfigContext);
}

export function ConfigProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/config/profile');
      setProfile(data);
      return data;
    } catch {
      // El backend no respondió: degradar al perfil por defecto (pastelería)
      setProfile(DEFAULT_PROFILE);
      return DEFAULT_PROFILE;
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // Aplicar branding al documento y al tema (color primario)
  useEffect(() => {
    if (profile?.branding?.name) document.title = profile.branding.name;
    const c = profile?.colors;
    if (!c) return;
    const root = document.documentElement.style;
    root.setProperty('--color-primary', c.primary);
    root.setProperty('--color-primary-light', c.primary_light);
    root.setProperty('--color-primary-dark', c.primary_dark);
    root.setProperty('--color-primary-bg', hexToRgba(c.primary, 0.07));
    root.setProperty('--color-border-focus', c.primary);
    root.setProperty('--color-accent', c.accent);
  }, [profile?.colors, profile?.branding?.name]);

  const p = profile || DEFAULT_PROFILE;

  const hasCapability = useCallback(
    (key) => !!p.capabilities?.[key],
    [p.capabilities]
  );

  const t = useCallback(
    (key, fallback) => p.terminology?.[key] || fallback || key,
    [p.terminology]
  );

  return (
    <ConfigContext.Provider value={{
      profile: p,
      loading,
      setupComplete: !!p.setup_complete,
      capabilities: p.capabilities,
      branding: p.branding,
      terminology: p.terminology,
      categories: p.product_categories,
      taxRate: p.tax_rate,
      hasCapability,
      t,
      refresh,
    }}>
      {children}
    </ConfigContext.Provider>
  );
}
