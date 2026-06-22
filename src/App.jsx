/**
 * App — Main application shell
 * Handles routing, authentication, sidebar.
 * DB init, seed y backup son manejados por el backend Python.
 */
import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSeller } from './context/SellerContext';
import { useConfig } from './context/ConfigContext';

// Pages
import Ventas from './pages/Ventas';
import Vitrina from './pages/Vitrina';
import Visicooler from './pages/Visicooler';
import Pedidos from './pages/Pedidos';
import Productos from './pages/Productos';
import Insumos from './pages/Insumos';
import Caja from './pages/Caja';
import Dashboard from './pages/Dashboard';
import Configuracion from './pages/Configuracion';
import HistorialVentas from './pages/HistorialVentas';
import Vendedores from './pages/Vendedores';
import SellerSelect from './pages/SellerSelect';
import SetupWizard from './pages/SetupWizard';
import Gastos from './pages/Gastos';
import Contabilidad from './pages/Contabilidad';
import Facturas from './pages/Facturas';
import DailyCashCheckModal from './components/DailyCashCheckModal';
import api from './utils/api';

// Layout
import Sidebar from './components/Layout/Sidebar';
import Header from './components/Layout/Header';

function AdminRoute({ children }) {
  const { currentSeller } = useSeller();
  if (currentSeller?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function PermissionRoute({ permission, children }) {
  const { currentSeller } = useSeller();
  if (currentSeller?.role === 'admin') return children;
  if (permission === 'products_access') {
    if (['view', 'full'].includes(currentSeller?.products_access)) return children;
    return <Navigate to="/" replace />;
  }
  if (currentSeller?.[permission]) return children;
  return <Navigate to="/" replace />;
}

function CapabilityRoute({ capability, children }) {
  const { hasCapability } = useConfig();
  if (!hasCapability(capability)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { currentSeller, loading } = useSeller();
  const { loading: configLoading, setupComplete } = useConfig();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);

  const [serverOnline, setServerOnline] = useState(true);

  // Escuchar eventos de red emitidos por api.js
  useEffect(() => {
    const handler = (e) => setServerOnline(e.detail.online);
    window.addEventListener('server-status', handler);
    return () => window.removeEventListener('server-status', handler);
  }, []);

  // Heartbeat cada 30s para detectar recuperación
  useEffect(() => {
    const ping = () =>
      fetch('/api/health')
        .then(() => setServerOnline(true))
        .catch(() => setServerOnline(false));
    const interval = setInterval(ping, 30000);
    return () => clearInterval(interval);
  }, []);

  const [dailyCheckNeeded, setDailyCheckNeeded] = useState(false);
  const [dailyCheckInfo, setDailyCheckInfo] = useState(null);

  useEffect(() => {
    if (!currentSeller) {
      setDailyCheckNeeded(false);
      return;
    }
    api.get('/cash/daily-status')
      .then(data => {
        if (data.needs_check) {
          setDailyCheckNeeded(true);
          setDailyCheckInfo(data);
        }
      })
      .catch(() => {});
  }, [currentSeller?.id]);

  useEffect(() => {
    if (window.__pwaInstallPrompt) setInstallPrompt(window.__pwaInstallPrompt);
    const handler = () => setInstallPrompt(window.__pwaInstallPrompt);
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (loading || configLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <span>Cargando sistema...</span>
      </div>
    );
  }

  if (!setupComplete) {
    return <SetupWizard />;
  }

  if (!currentSeller) {
    return <SellerSelect />;
  }

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
      window.__pwaInstallPrompt = null;
    }
  };

  return (
    <div className="app-layout">
      {dailyCheckNeeded && (
        <DailyCashCheckModal
          info={dailyCheckInfo}
          onDone={() => setDailyCheckNeeded(false)}
        />
      )}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="app-main" style={{ marginLeft: 'var(--sidebar-width)' }}>
        {!serverOnline && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            background: '#C0392B',
            color: '#fff',
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            fontSize: '0.9rem',
            fontWeight: 700,
            boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
          }}>
            <span style={{ fontSize: '1.1rem' }}>⚠️</span>
            Servidor desconectado — Avisa al administrador para que lo reinicie
            <span style={{
              fontSize: '0.75rem',
              opacity: 0.85,
              fontWeight: 500,
              marginLeft: 8,
            }}>
              (bash inicio.sh)
            </span>
          </div>
        )}
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <div className="page-content">
          <Routes>
            <Route path="/" element={<Ventas />} />
            <Route path="/vitrina" element={<CapabilityRoute capability="showcase"><Vitrina /></CapabilityRoute>} />
            <Route path="/visicooler" element={<CapabilityRoute capability="cooler_stock"><Visicooler /></CapabilityRoute>} />
            <Route path="/pedidos" element={<CapabilityRoute capability="orders"><Pedidos /></CapabilityRoute>} />
            <Route path="/caja" element={<Caja />} />

            <Route path="/gastos" element={<Gastos />} />
            <Route path="/contabilidad" element={<AdminRoute><Contabilidad /></AdminRoute>} />
            <Route path="/facturas" element={<AdminRoute><Facturas /></AdminRoute>} />

            <Route path="/productos" element={<PermissionRoute permission="products_access"><Productos /></PermissionRoute>} />
            <Route path="/insumos" element={<PermissionRoute permission="can_access_insumos"><Insumos /></PermissionRoute>} />
            <Route path="/dashboard" element={<AdminRoute><Dashboard /></AdminRoute>} />
            <Route path="/configuracion" element={<AdminRoute><Configuracion /></AdminRoute>} />
            <Route path="/historial" element={<PermissionRoute permission="can_access_historial"><HistorialVentas /></PermissionRoute>} />
            <Route path="/vendedores" element={<AdminRoute><Vendedores /></AdminRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>

      {installPrompt && (
        <div style={{
          position: 'fixed', bottom: 'var(--space-lg)', right: 'var(--space-lg)',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', padding: 'var(--space-sm) var(--space-md)',
          display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
          zIndex: 9998, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', fontSize: '0.875rem',
        }}>
          <span>📲</span>
          <span style={{ color: 'var(--color-text-secondary)' }}>Instalar como app</span>
          <button className="btn btn-primary btn-sm" onClick={handleInstall}>Instalar</button>
          <button className="btn btn-ghost btn-sm"
            onClick={() => { setInstallPrompt(null); window.__pwaInstallPrompt = null; }}
            aria-label="Cerrar">✕</button>
        </div>
      )}
    </div>
  );
}
