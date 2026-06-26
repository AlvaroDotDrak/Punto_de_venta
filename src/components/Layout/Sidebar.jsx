/**
 * Sidebar — Main navigation sidebar
 */
import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useSeller } from '../../context/SellerContext';
import { useConfig } from '../../context/ConfigContext';
import api from '../../utils/api';
import { getFreshnessStatus } from '../../utils/formatters';
import { ShoppingCart, Store, DollarSign, ClipboardList, Package, BarChart3, Settings, X, History, Users, Wheat, Thermometer, TrendingDown, BookOpen, FileText, ShoppingBag } from 'lucide-react';

// Cada ítem puede declarar `capability` (se oculta si el rubro no la tiene) y/o
// `termKey` (etiqueta adaptable por rubro vía terminología).
const navItems = [
  { section: 'Principal' },
  { path: '/', label: 'Punto de Venta', icon: ShoppingCart },
  { path: '/vitrina', label: 'Vitrina', icon: Store, badgeKey: 'vitrinaAlerts', capability: 'showcase', termKey: 'showcase' },
  { path: '/visicooler', label: 'Visicooler', icon: Thermometer, capability: 'cooler_stock', termKey: 'cooler' },
  { path: '/caja', label: 'Control de Caja', icon: DollarSign },
  { section: 'Gestión' },
  { path: '/pedidos', label: 'Pedidos', icon: ClipboardList, badgeKey: 'pendingOrders', capability: 'orders', termKey: 'orders' },
  { path: '/productos', label: 'Productos', icon: Package, permission: 'products_access' },
  { path: '/insumos', label: 'Insumos', icon: Wheat, permission: 'can_access_insumos', capability: 'recipes' },
  { section: 'Análisis' },
  { path: '/dashboard', label: 'Dashboard', icon: BarChart3, adminOnly: true },
  { path: '/historial', label: 'Historial Ventas', icon: History, permission: 'can_access_historial' },
  { section: 'Contabilidad' },
  { path: '/gastos', label: 'Gastos', icon: TrendingDown },
  { path: '/compras', label: 'Compras', icon: ShoppingBag, adminOnly: true },
  { path: '/contabilidad', label: 'Contabilidad', icon: BookOpen, adminOnly: true },
  { path: '/facturas', label: 'Facturas', icon: FileText, adminOnly: true },
  { section: 'Sistema' },
  { path: '/vendedores', label: 'Vendedores', icon: Users, adminOnly: true },
  { path: '/configuracion', label: 'Configuración', icon: Settings, adminOnly: true },
];

export default function Sidebar({ open, onClose }) {
  const { currentSeller } = useSeller();
  const { hasCapability, t, branding } = useConfig();
  const [vitrinaAlerts, setVitrinaAlerts] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);

  useEffect(() => {
    if (!currentSeller) return;

    const loadBadges = async () => {
      try {
        const [showcase, orders] = await Promise.all([
          api.get('/showcase?status=active'),
          api.get('/orders'),
        ]);

        // Contar items en vitrina con alerta de frescura (warning o danger)
        const alerts = showcase.filter(item =>
          item.product?.max_showcase_hours &&
          getFreshnessStatus(item.placed_at, item.product.max_showcase_hours) !== 'fresh'
        ).length;
        setVitrinaAlerts(alerts);

        // Contar pedidos activos (sin incluir entregados)
        const pending = orders.filter(o =>
          ['pendiente', 'en_produccion', 'listo'].includes(o.status)
        ).length;
        setPendingOrders(pending);
      } catch {
        // Los badges son informativos; falla silenciosamente
      }
    };

    loadBadges();
    const interval = setInterval(loadBadges, 60_000);
    return () => clearInterval(interval);
  }, [currentSeller]);

  const badges = { vitrinaAlerts, pendingOrders };
  const isAdmin = currentSeller?.role === 'admin';

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon" style={branding?.logo ? { background: '#fff', padding: 3 } : undefined}>
          {branding?.logo
            ? <img src={branding.logo} alt={branding.name || 'Logo'} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : (branding?.emoji || '🧁')}
        </div>
        <div className="sidebar-brand-text">
          <h2 className="text-display" style={{ fontSize: '1.2rem' }}>{branding?.name || 'Punto de Venta'}</h2>
          <span style={{ fontSize: '0.65rem', letterSpacing: '1px' }}>{branding?.tagline || ''}</span>
        </div>
        <button className="modal-close" onClick={onClose} style={{ marginLeft: 'auto', display: open ? 'block' : 'none' }}>
          <X size={20} />
        </button>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item, i) => {
          if (item.section) {
            return (
              <div key={i} className="sidebar-section-label">
                {item.section}
              </div>
            );
          }

          // Ocultar ítems cuyo módulo no está activo en este rubro
          if (item.capability && !hasCapability(item.capability)) return null;

          // Skip admin-only items for non-admin users
          if (item.adminOnly && !isAdmin) return null;

          if (item.permission && !isAdmin) {
            if (item.permission === 'products_access') {
              if (!['view', 'full'].includes(currentSeller?.products_access)) return null;
            } else if (!currentSeller?.[item.permission]) {
              return null;
            }
          }

          const Icon = item.icon;
          const badgeCount = item.badgeKey ? badges[item.badgeKey] : 0;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={onClose}
            >
              <Icon className="icon" size={20} />
              <span>{item.termKey ? t(item.termKey, item.label) : item.label}</span>
              {badgeCount > 0 && <span className="sidebar-badge">{badgeCount}</span>}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}

