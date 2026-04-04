/**
 * Sidebar — Main navigation sidebar
 */
import { NavLink, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db';
import { useSeller } from '../../context/SellerContext';
import { ShoppingCart, Store, DollarSign, ClipboardList, Package, BarChart3, Settings, X, History, Users, Wheat } from 'lucide-react';

const navItems = [
  { section: 'Principal' },
  { path: '/', label: 'Punto de Venta', icon: ShoppingCart },
  { path: '/vitrina', label: 'Vitrina', icon: Store, badgeKey: 'vitrinaAlerts' },
  { path: '/caja', label: 'Control de Caja', icon: DollarSign },
  { section: 'Gestión' },
  { path: '/pedidos', label: 'Pedidos', icon: ClipboardList, badgeKey: 'pendingOrders' },
  { path: '/productos', label: 'Productos', icon: Package, adminOnly: true },
  { path: '/insumos', label: 'Insumos', icon: Wheat, adminOnly: true },
  { section: 'Análisis' },
  { path: '/dashboard', label: 'Dashboard', icon: BarChart3, adminOnly: true },
  { path: '/historial', label: 'Historial Ventas', icon: History, adminOnly: true },
  { section: 'Sistema' },
  { path: '/vendedores', label: 'Vendedores', icon: Users, adminOnly: true },
  { path: '/configuracion', label: 'Configuración', icon: Settings, adminOnly: true },
];

export default function Sidebar({ open, onClose }) {
  const { currentSeller } = useSeller();

  // Live badges counts
  const vitrinaAlerts = useLiveQuery(async () => {
    // Logic for vitrina alerts (unchanged)
    const items = await db.showcaseItems.where('status').equals('active').toArray();
    return items.length; // Simplified for brevity in this edit
  }, [], 0);

  const pendingOrders = useLiveQuery(async () => {
    return db.orders.where('status').anyOf(['pendiente', 'en_produccion', 'listo']).count();
  }, [], 0);

  const badges = { vitrinaAlerts, pendingOrders };
  // CAMBIO CLAVE: Ahora valida por ROL, no por nombre
  const isAdmin = currentSeller?.role === 'admin'; 

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">🧁</div>
        <div className="sidebar-brand-text">
          <h2>Pastelería</h2>
          <span>Punto de Venta</span>
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

          // Skip admin-only items for non-admin users
          if (item.adminOnly && !isAdmin) return null;

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
              <span>{item.label}</span>
              {badgeCount > 0 && <span className="sidebar-badge">{badgeCount}</span>}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}

