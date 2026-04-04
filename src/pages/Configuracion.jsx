/**
 * Configuración — Settings page
 * Seller management (with PIN hashing), backup/restore, audit log, data clearing
 */
import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useSeller } from '../context/SellerContext';
import { useToast } from '../context/ToastContext';
import { hashPin } from '../utils/crypto';
import { logAction, ACTIONS, getRecentLogs } from '../utils/auditLog';
import { formatCurrency, formatDate } from '../utils/formatters';
import { Settings, Users, Download, Upload, Trash2, X, Edit, UserPlus, Shield, Clock } from 'lucide-react';

export default function Configuracion() {
  const toast = useToast();
  const { currentSeller, refreshSellers } = useSeller();
  const [activeTab, setActiveTab] = useState('sellers');
  const [showSellerModal, setShowSellerModal] = useState(false);
  const [editingSeller, setEditingSeller] = useState(null);
  const [sellerForm, setSellerForm] = useState({ name: '', pin: '' });
  const [auditLogs, setAuditLogs] = useState([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const sellers = useLiveQuery(() => db.sellers.toArray(), [], []);

  // Load audit logs
  useEffect(() => {
    if (activeTab === 'audit') {
      getRecentLogs(100).then(setAuditLogs);
    }
  }, [activeTab]);

  // --- Seller Management ---
  const handleSaveSeller = async () => {
    if (!sellerForm.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    try {
      let pinHash = null;
      if (sellerForm.pin) {
        pinHash = await hashPin(sellerForm.pin);
      }

      if (editingSeller) {
        const update = { name: sellerForm.name };
        if (sellerForm.pin) update.pin = pinHash;
        await db.sellers.update(editingSeller.id, update);
        toast.success('Vendedor actualizado');
      } else {
        await db.sellers.add({
          name: sellerForm.name,
          pin: pinHash,
          active: true,
        });
        toast.success('Vendedor creado');
      }
      setShowSellerModal(false);
      setSellerForm({ name: '', pin: '' });
      setEditingSeller(null);
      if (refreshSellers) refreshSellers();
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const toggleSellerActive = async (seller) => {
    await db.sellers.update(seller.id, { active: !seller.active });
    toast.info(`${seller.name} ${seller.active ? 'desactivado' : 'activado'}`);
    if (refreshSellers) refreshSellers();
  };

  const openEditSeller = (seller) => {
    setEditingSeller(seller);
    setSellerForm({ name: seller.name, pin: '' }); // PIN blank = don't change
    setShowSellerModal(true);
  };

  // --- Data Management ---
  const handleExport = async () => {
    try {
      const data = {
        products: await db.products.toArray(),
        sales: await db.sales.toArray(),
        saleItems: await db.saleItems.toArray(),
        orders: await db.orders.toArray(),
        orderItems: await db.orderItems.toArray(),
        showcaseItems: await db.showcaseItems.toArray(),
        cashRegister: await db.cashRegister.toArray(),
        cashMovements: await db.cashMovements.toArray(),
        sellers: await db.sellers.toArray(),
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pasteleria-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Datos exportados correctamente');
      await logAction(ACTIONS.DATA_EXPORT, currentSeller?.id, `Exportación manual de datos`);
    } catch (err) {
      toast.error('Error al exportar: ' + err.message);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Validar estructura antes de importar
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          toast.error('El archivo no tiene el formato correcto (se esperaba un objeto JSON)');
          return;
        }
        const knownTables = ['products', 'sales', 'saleItems', 'orders', 'orderItems',
          'showcaseItems', 'cashRegister', 'cashMovements', 'sellers'];
        if (!knownTables.some(t => t in data)) {
          toast.error('El archivo no contiene datos reconocibles. ¿Es un backup de esta aplicación?');
          return;
        }
        for (const table of knownTables) {
          if (table in data && !Array.isArray(data[table])) {
            toast.error(`El campo "${table}" tiene un formato inválido. El archivo puede estar corrupto.`);
            return;
          }
        }

        if (data.products) await db.products.bulkPut(data.products);
        if (data.sales) await db.sales.bulkPut(data.sales);
        if (data.saleItems) await db.saleItems.bulkPut(data.saleItems);
        if (data.orders) await db.orders.bulkPut(data.orders);
        if (data.orderItems) await db.orderItems.bulkPut(data.orderItems);
        if (data.showcaseItems) await db.showcaseItems.bulkPut(data.showcaseItems);
        if (data.cashRegister) await db.cashRegister.bulkPut(data.cashRegister);
        if (data.cashMovements) await db.cashMovements.bulkPut(data.cashMovements);
        if (data.sellers) await db.sellers.bulkPut(data.sellers);
        
        toast.success('Datos importados correctamente');
        await logAction(ACTIONS.DATA_IMPORT, currentSeller?.id, `Importación desde archivo: ${file.name}`);
        if (refreshSellers) refreshSellers();
      } catch (err) {
        toast.error('Error al importar: ' + err.message);
      }
    };
    input.click();
  };

  const handleClearAll = async () => {
    try {
      await Promise.all([
        db.products.clear(),
        db.sales.clear(),
        db.saleItems.clear(),
        db.orders.clear(),
        db.orderItems.clear(),
        db.showcaseItems.clear(),
        db.cashRegister.clear(),
        db.cashMovements.clear(),
        db.sellers.clear(),
      ]);
      await logAction(ACTIONS.DATA_CLEAR, currentSeller?.id, 'Todos los datos borrados');
      toast.success('Todos los datos han sido eliminados');
      setShowClearConfirm(false);
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  // Audit action labels
  const actionLabels = {
    login: '🟢 Inicio de sesión',
    login_failed: '🔴 PIN incorrecto',
    login_locked: '🔒 Cuenta bloqueada',
    logout: '🔵 Cierre de sesión',
    sale: '💰 Venta',
    cash_open: '🔓 Apertura de caja',
    cash_close: '🔒 Cierre de caja',
    data_export: '📤 Exportación',
    data_import: '📥 Importación',
    data_clear: '🗑️ Limpieza de datos',
    product_create: '📦 Producto creado',
    product_update: '📝 Producto actualizado',
    order_create: '📋 Pedido creado',
    order_update: '📋 Pedido actualizado',
    backup_auto: '💾 Backup automático',
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Settings size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Configuración
        </h1>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${activeTab === 'sellers' ? 'active' : ''}`} onClick={() => setActiveTab('sellers')}>
          <Users size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Vendedores
        </button>
        <button className={`tab ${activeTab === 'data' ? 'active' : ''}`} onClick={() => setActiveTab('data')}>
          <Download size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Datos
        </button>
        <button className={`tab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>
          <Shield size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Auditoría
        </button>
      </div>

      {/* SELLERS TAB */}
      {activeTab === 'sellers' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-md)' }}>
            <button className="btn btn-primary" onClick={() => { setShowSellerModal(true); setEditingSeller(null); setSellerForm({ name: '', pin: '' }); }}>
              <UserPlus size={16} /> Nuevo Vendedor
            </button>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>PIN</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map(seller => (
                  <tr key={seller.id}>
                    <td style={{ fontWeight: 500 }}>{seller.name}</td>
                    <td>{seller.pin ? '🔒 Configurado' : '⚠️ Sin PIN'}</td>
                    <td>
                      <span className={`badge ${seller.active !== false ? 'badge-fresh' : 'badge-danger'}`}>
                        {seller.active !== false ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEditSeller(seller)}>
                          <Edit size={14} />
                        </button>
                        <button
                          className={`btn btn-sm ${seller.active !== false ? 'btn-danger' : 'btn-success'}`}
                          onClick={() => toggleSellerActive(seller)}
                        >
                          {seller.active !== false ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DATA TAB */}
      {activeTab === 'data' && (
        <div className="grid-3" style={{ maxWidth: 800 }}>
          <div className="card" style={{ padding: 'var(--space-lg)', textAlign: 'center' }}>
            <Download size={32} style={{ color: 'var(--color-primary)', marginBottom: 'var(--space-sm)' }} />
            <h3 style={{ fontFamily: 'var(--font-body)', marginBottom: 'var(--space-sm)' }}>Exportar Datos</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
              Descarga todos los datos como archivo JSON
            </p>
            <button className="btn btn-primary" onClick={handleExport}>
              <Download size={16} /> Exportar
            </button>
          </div>
          <div className="card" style={{ padding: 'var(--space-lg)', textAlign: 'center' }}>
            <Upload size={32} style={{ color: 'var(--color-info)', marginBottom: 'var(--space-sm)' }} />
            <h3 style={{ fontFamily: 'var(--font-body)', marginBottom: 'var(--space-sm)' }}>Importar Datos</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
              Restaurar datos desde un archivo JSON
            </p>
            <button className="btn btn-secondary" onClick={handleImport}>
              <Upload size={16} /> Importar
            </button>
          </div>
          <div className="card" style={{ padding: 'var(--space-lg)', textAlign: 'center' }}>
            <Trash2 size={32} style={{ color: 'var(--color-danger)', marginBottom: 'var(--space-sm)' }} />
            <h3 style={{ fontFamily: 'var(--font-body)', marginBottom: 'var(--space-sm)' }}>Borrar Todo</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
              Eliminar todos los datos permanentemente
            </p>
            <button className="btn btn-danger" onClick={() => setShowClearConfirm(true)}>
              <Trash2 size={16} /> Borrar
            </button>
          </div>
        </div>
      )}

      {/* AUDIT TAB */}
      {activeTab === 'audit' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
              Últimas {auditLogs.length} acciones registradas
            </p>
            <button className="btn btn-ghost btn-sm" onClick={() => getRecentLogs(100).then(setAuditLogs)}>
              Refrescar
            </button>
          </div>
          {auditLogs.length === 0 ? (
            <div className="empty-state">
              <Shield size={48} />
              <h3>Sin registros</h3>
              <p>No hay acciones registradas en el log de auditoría</p>
            </div>
          ) : (
            <div className="table-wrapper audit-log-table">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Acción</th>
                    <th>Detalles</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr key={log.id}>
                      <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        <Clock size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                        {formatDate(log.createdAt)}
                      </td>
                      <td>
                        <span style={{ fontSize: '0.85rem' }}>
                          {actionLabels[log.action] || log.action}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                        {log.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Seller Modal */}
      {showSellerModal && (
        <div className="modal-overlay" onClick={() => setShowSellerModal(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingSeller ? 'Editar Vendedor' : 'Nuevo Vendedor'}</h2>
              <button className="modal-close" onClick={() => setShowSellerModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Nombre del vendedor"
                  value={sellerForm.name}
                  onChange={e => setSellerForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  PIN {editingSeller ? '(dejar vacío para no cambiar)' : ''}
                </label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="PIN numérico (4-6 dígitos)"
                  value={sellerForm.pin}
                  onChange={e => setSellerForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                  inputMode="numeric"
                  maxLength={6}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSellerModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveSeller}>
                {editingSeller ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div className="modal-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>⚠️ Confirmar eliminación</h2>
              <button className="modal-close" onClick={() => setShowClearConfirm(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--color-danger)', fontWeight: 600, marginBottom: 'var(--space-md)' }}>
                Esta acción eliminará TODOS los datos de forma permanente.
              </p>
              <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                Se recomienda exportar un respaldo antes de continuar.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowClearConfirm(false)}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleClearAll}>
                <Trash2 size={16} /> Sí, borrar todo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
