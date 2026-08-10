/**
 * Vendedores — Admin dashboard para gestión de personal
 * V3.0: consume FastAPI backend
 */
import { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { useSeller } from '../context/SellerContext';
import api from '../utils/api';
import { Users, Plus, Edit, Shield, Key, Activity, X, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';

const emptyForm = { 
  name: '', 
  pin: '', 
  role: 'seller', 
  active: true,
  products_access: 'none',
  can_access_insumos: false,
  can_access_historial: false,
  can_void_sales: false,
  can_close_cash: false,
  can_cash_movements: false,
  can_view_costs: false,
  can_view_totals: false,
  can_withdraw_cash: false,
  can_apply_discount: false,
  can_give_courtesy: false,
  can_manage_expenses: false,
  can_view_expense_history: false
};

const PERMISSION_PRESETS = {
  cajero: { products_access: 'none', can_access_insumos: false, can_access_historial: false,
    can_void_sales: false, can_close_cash: false, can_cash_movements: false, can_view_costs: false,
    can_view_totals: false, can_withdraw_cash: false, can_apply_discount: true, can_give_courtesy: false,
    can_manage_expenses: false, can_view_expense_history: false },
  encargado: { products_access: 'view', can_access_insumos: false, can_access_historial: true,
    can_void_sales: true, can_close_cash: true, can_cash_movements: true, can_view_costs: false,
    can_view_totals: true, can_withdraw_cash: true, can_apply_discount: true, can_give_courtesy: true,
    can_manage_expenses: true, can_view_expense_history: true },
  bodeguero: { products_access: 'full', can_access_insumos: true, can_access_historial: false,
    can_void_sales: false, can_close_cash: false, can_cash_movements: false, can_view_costs: true,
    can_view_totals: false, can_withdraw_cash: false, can_apply_discount: false, can_give_courtesy: false,
    can_manage_expenses: true, can_view_expense_history: true },
};

export default function Vendedores() {
  const toast = useToast();
  const { currentSeller } = useSeller();

  const [sellers, setSellers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const loadSellers = async () => {
    const data = await api.get('/sellers').catch(() => []);
    setSellers(data);
  };

  useEffect(() => { loadSellers(); }, []);

  useEffect(() => {
    if (!showLogs) { setAuditLogs([]); return; }
    api.get(`/audit?seller_id=${showLogs}&limit=50`)
      .then(setAuditLogs)
      .catch(() => setAuditLogs([]));
  }, [showLogs]);

  const updateField = (f, v) => setForm(prev => ({ ...prev, [f]: v }));

  const handleSubmit = async () => {
    if (!form.name.trim() || (!editingId && !form.pin.trim())) {
      toast.error('Nombre y PIN son obligatorios');
      return;
    }
    if (form.pin && form.pin.length < 4) {
      toast.error('El PIN debe tener al menos 4 dígitos');
      return;
    }
    try {
      if (editingId) {
        const patch = { 
          name: form.name, 
          role: form.role, 
          active: form.active,
          products_access: form.products_access,
          can_access_insumos: form.can_access_insumos,
          can_access_historial: form.can_access_historial,
          can_void_sales: form.can_void_sales,
          can_close_cash: form.can_close_cash,
          can_cash_movements: form.can_cash_movements,
          can_view_costs: form.can_view_costs,
          can_view_totals: form.can_view_totals,
          can_withdraw_cash: form.can_withdraw_cash,
          can_apply_discount: form.can_apply_discount,
          can_give_courtesy: form.can_give_courtesy,
          can_manage_expenses: form.can_manage_expenses,
          can_view_expense_history: form.can_view_expense_history
        };
        if (form.pin) patch.pin = form.pin;
        await api.patch(`/sellers/${editingId}`, patch);
        toast.success('Vendedor actualizado');
      } else {
        await api.post('/sellers', { name: form.name, pin: form.pin, role: form.role });
        toast.success('Vendedor creado');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      loadSellers();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  const handleEdit = (seller) => {
    setEditingId(seller.id);
    setForm({ 
      name: seller.name, 
      pin: '', 
      role: seller.role, 
      active: seller.active,
      products_access: seller.products_access || 'none',
      can_access_insumos: !!seller.can_access_insumos,
      can_access_historial: !!seller.can_access_historial,
      can_void_sales: !!seller.can_void_sales,
      can_close_cash: !!seller.can_close_cash,
      can_cash_movements: !!seller.can_cash_movements,
      can_view_costs: !!seller.can_view_costs,
      can_view_totals: !!seller.can_view_totals,
      can_withdraw_cash: !!seller.can_withdraw_cash,
      can_apply_discount: !!seller.can_apply_discount,
      can_give_courtesy: !!seller.can_give_courtesy,
      can_manage_expenses: !!seller.can_manage_expenses,
      can_view_expense_history: !!seller.can_view_expense_history
    });
    setShowForm(true);
  };

  const handleToggleActive = async (seller) => {
    try {
      await api.patch(`/sellers/${seller.id}`, { active: !seller.active });
      toast.success(seller.active ? 'Vendedor desactivado' : 'Vendedor activado');
      loadSellers();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Users size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Vendedores
        </h1>
        <button className="btn btn-primary" onClick={() => { setEditingId(null); setForm(emptyForm); setShowForm(true); }}>
          <Plus size={16} /> Nuevo Vendedor
        </button>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr><th>Nombre</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {sellers.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: 600 }}>{s.name}</td>
                <td>
                  <span className={`badge ${s.role === 'dev' ? 'badge-danger' : s.role === 'admin' ? 'badge-warning' : 'badge-info'}`}>
                    <Shield size={12} /> {s.role === 'dev' ? 'Soporte' : s.role === 'admin' ? 'Admin' : 'Vendedor'}
                  </span>
                </td>
                <td>
                  {s.active
                    ? <span className="badge badge-fresh"><CheckCircle size={12} /> Activo</span>
                    : <span className="badge badge-danger"><XCircle size={12} /> Inactivo</span>}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(s)}>
                      <Edit size={14} /> Editar
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowLogs(showLogs === s.id ? null : s.id)}>
                      <Activity size={14} /> Logs
                    </button>
                    {s.id !== currentSeller?.id && (
                      <button className="btn btn-ghost btn-sm" onClick={() => handleToggleActive(s)}>
                        {s.active ? <XCircle size={14} /> : <CheckCircle size={14} />}
                        {s.active ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showLogs && auditLogs.length > 0 && (
        <div className="card" style={{ marginTop: 'var(--space-lg)' }}>
          <div className="card-header">
            <h3 className="card-title"><Activity size={16} /> Actividad reciente — {sellers.find(s => s.id === showLogs)?.name}</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowLogs(null)}><X size={14} /></button>
          </div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Fecha</th><th>Acción</th><th>Detalle</th></tr></thead>
              <tbody>
                {auditLogs.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {format(new Date(log.created_at), 'dd/MM/yy HH:mm')}
                    </td>
                    <td><span className="badge badge-info">{log.action}</span></td>
                    <td style={{ fontSize: '0.85rem' }}>{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'Editar Vendedor' : 'Nuevo Vendedor'}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input className="form-input" value={form.name} onChange={e => updateField('name', e.target.value)} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">{editingId ? 'Nuevo PIN (dejar vacío para no cambiar)' : 'PIN'}</label>
                <input className="form-input" type="password" inputMode="numeric"
                  value={form.pin} onChange={e => updateField('pin', e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={editingId ? 'Sin cambios' : '4-6 dígitos'} />
              </div>
              <div className="form-group">
                <label className="form-label">Rol</label>
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  {(form.role === 'dev' ? ['dev'] : ['seller', 'admin']).map(r => (
                    <button key={r} className={`btn ${form.role === r ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => updateField('role', r)}>
                      <Shield size={14} /> {r === 'dev' ? 'Soporte' : r === 'admin' ? 'Admin' : 'Vendedor'}
                    </button>
                  ))}
                </div>
              </div>

              {editingId && form.role === 'seller' && (
                <div style={{ marginTop: 'var(--space-md)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-md)' }}>
                  <h3 className="section-title" style={{ fontSize: '1rem', marginBottom: 'var(--space-sm)' }}>Permisos adicionales</h3>
                  
                  <div className="form-group">
                    <label className="form-label">Plantilla rápida</label>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                      {[['cajero','Cajero'],['encargado','Encargado'],['bodeguero','Bodeguero']].map(([k,lbl]) => (
                        <button key={k} type="button" className="btn btn-secondary btn-sm"
                          onClick={() => setForm(prev => ({ ...prev, ...PERMISSION_PRESETS[k] }))}>{lbl}</button>
                      ))}
                    </div>
                    <small style={{ color: 'var(--color-text-light)' }}>
                      Aplica un set de permisos; podés ajustarlos abajo.
                    </small>
                  </div>

                  <h4 className="section-title" style={{ marginTop: 'var(--space-md)', fontSize: '0.9rem' }}>Inventario</h4>
                  <div className="form-group">
                    <label className="form-label">Productos</label>
                    <select className="form-input" value={form.products_access} onChange={e => updateField('products_access', e.target.value)}>
                      <option value="none">Sin acceso</option>
                      <option value="view">Solo ver</option>
                      <option value="full">Editar</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <input type="checkbox" id="can_access_insumos" checked={form.can_access_insumos} onChange={e => updateField('can_access_insumos', e.target.checked)} />
                    <label htmlFor="can_access_insumos" className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>Acceso a Insumos</label>
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <input type="checkbox" id="can_view_costs" checked={form.can_view_costs} onChange={e => updateField('can_view_costs', e.target.checked)} />
                    <label htmlFor="can_view_costs" className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>Ver costos y márgenes</label>
                  </div>

                  <h4 className="section-title" style={{ marginTop: 'var(--space-md)', fontSize: '0.9rem' }}>Caja</h4>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <input type="checkbox" id="can_close_cash" checked={form.can_close_cash} onChange={e => updateField('can_close_cash', e.target.checked)} />
                    <label htmlFor="can_close_cash" className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>Cerrar caja</label>
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <input type="checkbox" id="can_cash_movements" checked={form.can_cash_movements} onChange={e => updateField('can_cash_movements', e.target.checked)} />
                    <label htmlFor="can_cash_movements" className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>Ingresos/retiros de caja</label>
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <input type="checkbox" id="can_view_totals" checked={form.can_view_totals} onChange={e => updateField('can_view_totals', e.target.checked)} />
                    <label htmlFor="can_view_totals" className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>Ver totales del negocio (tarjeta, transferencia, venta total)</label>
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <input type="checkbox" id="can_withdraw_cash" checked={form.can_withdraw_cash} onChange={e => updateField('can_withdraw_cash', e.target.checked)} />
                    <label htmlFor="can_withdraw_cash" className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>Retirar efectivo del cajón (sangría)</label>
                  </div>

                  <h4 className="section-title" style={{ marginTop: 'var(--space-md)', fontSize: '0.9rem' }}>Gastos</h4>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <input type="checkbox" id="can_view_expense_history"
                      checked={form.can_view_expense_history || form.can_manage_expenses}
                      disabled={form.can_manage_expenses}
                      onChange={e => updateField('can_view_expense_history', e.target.checked)} />
                    <label htmlFor="can_view_expense_history" className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>Ver historial de gastos</label>
                  </div>
                  <small style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-light)' }}>
                    Consultar los gastos de días anteriores y filtrar por fecha, categoría o
                    proveedor. Solo lectura: no puede editarlos ni eliminarlos.
                  </small>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <input type="checkbox" id="can_manage_expenses" checked={form.can_manage_expenses} onChange={e => updateField('can_manage_expenses', e.target.checked)} />
                    <label htmlFor="can_manage_expenses" className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>Gestionar gastos</label>
                  </div>
                  <small style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-light)' }}>
                    Editar y eliminar gastos, y crear o modificar categorías y proveedores.
                    Incluye el historial. Registrar un gasto no necesita ningún permiso.
                  </small>

                  <h4 className="section-title" style={{ marginTop: 'var(--space-md)', fontSize: '0.9rem' }}>Ventas</h4>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <input type="checkbox" id="can_apply_discount" checked={form.can_apply_discount} onChange={e => updateField('can_apply_discount', e.target.checked)} />
                    <label htmlFor="can_apply_discount" className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>Aplicar el descuento configurado</label>
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <input type="checkbox" id="can_give_courtesy" checked={form.can_give_courtesy} onChange={e => updateField('can_give_courtesy', e.target.checked)} />
                    <label htmlFor="can_give_courtesy" className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>Entregar cortesías (producto sin cobrar)</label>
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <input type="checkbox" id="can_access_historial" checked={form.can_access_historial} onChange={e => updateField('can_access_historial', e.target.checked)} />
                    <label htmlFor="can_access_historial" className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>Acceso a Historial</label>
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <input type="checkbox" id="can_void_sales" checked={form.can_void_sales} onChange={e => updateField('can_void_sales', e.target.checked)} />
                    <label htmlFor="can_void_sales" className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>Anular ventas</label>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSubmit}>
                {editingId ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
