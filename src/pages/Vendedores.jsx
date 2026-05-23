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
  can_access_historial: false 
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
          can_access_historial: form.can_access_historial
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
      can_access_historial: !!seller.can_access_historial
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
                  <span className={`badge ${s.role === 'admin' ? 'badge-warning' : 'badge-info'}`}>
                    <Shield size={12} /> {s.role === 'admin' ? 'Admin' : 'Vendedor'}
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
                  {['seller', 'admin'].map(r => (
                    <button key={r} className={`btn ${form.role === r ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => updateField('role', r)}>
                      <Shield size={14} /> {r === 'admin' ? 'Admin' : 'Vendedor'}
                    </button>
                  ))}
                </div>
              </div>

              {editingId && form.role === 'seller' && (
                <div style={{ marginTop: 'var(--space-md)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-md)' }}>
                  <h3 className="section-title" style={{ fontSize: '1rem', marginBottom: 'var(--space-sm)' }}>Permisos adicionales</h3>
                  
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
                    <input type="checkbox" id="can_access_historial" checked={form.can_access_historial} onChange={e => updateField('can_access_historial', e.target.checked)} />
                    <label htmlFor="can_access_historial" className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>Acceso a Historial</label>
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
