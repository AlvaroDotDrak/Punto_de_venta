/**
 * App — Main application shell
 * Handles routing, authentication, sidebar.
 * DB init, seed y backup son manejados por el backend Python.
 */
import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSeller } from './context/SellerContext';

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
import Gastos from './pages/Gastos';
import Contabilidad from './pages/Contabilidad';
import Facturas from './pages/Facturas';

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

export default function App() {
  const { currentSeller, loading } = useSeller();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    if (window.__pwaInstallPrompt) setInstallPrompt(window.__pwaInstallPrompt);
    const handler = () => setInstallPrompt(window.__pwaInstallPrompt);
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <span>Cargando sistema...</span>
      </div>
    );
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
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="app-main" style={{ marginLeft: 'var(--sidebar-width)' }}>
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <div className="page-content">
          <Routes>
            <Route path="/" element={<Ventas />} />
            <Route path="/vitrina" element={<Vitrina />} />
            <Route path="/visicooler" element={<Visicooler />} />
            <Route path="/pedidos" element={<Pedidos />} />
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
