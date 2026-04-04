/**
 * App — Main application shell
 * Handles routing, authentication, sidebar, and auto-backup
 */
import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSeller } from './context/SellerContext';
import seedDatabase from './utils/seedData';
import { checkAndRunBackup } from './utils/autoBackup';
import fixRoles from './utils/fixRoles'; // Import script de migración

// Pages
import Ventas from './pages/Ventas';
import Vitrina from './pages/Vitrina';
import Pedidos from './pages/Pedidos';
import Productos from './pages/Productos';
import Insumos from './pages/Insumos';
import Caja from './pages/Caja';
import Dashboard from './pages/Dashboard';
import Configuracion from './pages/Configuracion';
import HistorialVentas from './pages/HistorialVentas';
import Vendedores from './pages/Vendedores'; // Nuevo módulo
import SellerSelect from './pages/SellerSelect';

// Layout
import Sidebar from './components/Layout/Sidebar';
import Header from './components/Layout/Header';
import StorageWarning from './components/StorageWarning';

function AdminRoute({ children }) {
  const { currentSeller } = useSeller();
  if (currentSeller?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { currentSeller, loading } = useSeller();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);

  // Recoger el prompt de instalación PWA si ya fue capturado en main.jsx
  useEffect(() => {
    if (window.__pwaInstallPrompt) {
      setInstallPrompt(window.__pwaInstallPrompt);
    }
    const handler = () => setInstallPrompt(window.__pwaInstallPrompt);
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    async function init() {
      await seedDatabase();
      await fixRoles(); // Ejecutar migración de Roles v5
      setDbReady(true);
      // Trigger auto-backup check
      checkAndRunBackup();
    }
    init();
  }, []);

  if (loading || !dbReady) {
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
            {/* Rutas accesibles para todos los vendedores */}
            <Route path="/" element={<Ventas />} />
            <Route path="/vitrina" element={<Vitrina />} />
            <Route path="/pedidos" element={<Pedidos />} />
            <Route path="/caja" element={<Caja />} />

            {/* Rutas solo para administradores */}
            <Route path="/productos" element={<AdminRoute><Productos /></AdminRoute>} />
            <Route path="/insumos" element={<AdminRoute><Insumos /></AdminRoute>} />
            <Route path="/dashboard" element={<AdminRoute><Dashboard /></AdminRoute>} />
            <Route path="/configuracion" element={<AdminRoute><Configuracion /></AdminRoute>} />
            <Route path="/historial" element={<AdminRoute><HistorialVentas /></AdminRoute>} />
            <Route path="/vendedores" element={<AdminRoute><Vendedores /></AdminRoute>} />

            {/* Cualquier ruta desconocida → inicio */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>

      {/* Banner de instalación PWA */}
      {installPrompt && (
        <div style={{
          position: 'fixed',
          bottom: 'var(--space-lg)',
          right: 'var(--space-lg)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-sm) var(--space-md)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          zIndex: 9998,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          fontSize: '0.875rem',
        }}>
          <span>📲</span>
          <span style={{ color: 'var(--color-text-secondary)' }}>Instalar como app</span>
          <button className="btn btn-primary btn-sm" onClick={handleInstall}>
            Instalar
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setInstallPrompt(null); window.__pwaInstallPrompt = null; }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
      )}

      <StorageWarning />
    </div>
  );
}
