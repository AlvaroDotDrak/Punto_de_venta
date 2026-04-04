/**
 * Vendedores — Admin dashboard for managing staff
 * Features: List sellers, Create/Edit with roles, View audit logs
 */
import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useToast } from '../context/ToastContext';
import { useSeller } from '../context/SellerContext';
import { logAction, ACTIONS } from '../utils/auditLog';
import { Users, Plus, Edit, Shield, Trash2, Key, Activity, Search, X, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';

const emptyForm = { name: '', pin: '', role: 'seller', active: true };

export default function Vendedores() {
  const toast = useToast();
  const { currentSeller } = useSeller();
  
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showLogs, setShowLogs] = useState(null); // ID of seller to show logs for

  // Load data
  const sellers = useLiveQuery(() => db.sellers.toArray(), [], []);
  
  // Load audit logs for selected seller
  const auditLogs = useLiveQuery(async () => {
    if (!showLogs) return [];
    return db.auditLog
      .where('userId').equals(showLogs)
      .reverse()
      .limit(50)
      .toArray();
  }, [showLogs], []);

  // Form handlers
  const updateField = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.pin.trim()) {
      toast.error('Nombre y PIN son obligatorios');
      return;
    }
    if (form.pin.length < 4) {
      toast.error('El PIN debe tener al menos 4 dígitos');
      return;
    }

    try {
      if (editingId) {
        await db.sellers.update(editingId, form);
        toast.success('Vendedor actualizado');
        await logAction(ACTIONS.SELLER_UPDATE, currentSeller?.id, `Actualizó a ${form.name} (${form.role})`);
      } else {
        await db.sellers.add(form);
        toast.success('Vendedor creado');
        await logAction(ACTIONS.SELLER_CREATE, currentSeller?.id, `Creó a ${form.name} (${form.role})`);
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      toast.error('Error al guardar: ' + err.message);
    }
  };

  const editSeller = (seller) => {
    setForm(seller);
    setEditingId(seller.id);
    setShowForm(true);
  };

  const toggleActive = async (seller) => {
    // Prevent deactivating yourself
    if (seller.id === currentSeller?.id) {
      toast.error('No puedes desactivar tu propio usuario');
      return;
    }
    await db.sellers.update(seller.id, { active: !seller.active });
    toast.info(`${seller.name} ${seller.active ? 'desactivado' : 'activado'}`);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Users size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Gestión de Personal
        </h1>
        <button className="btn btn-primary" onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); }}>
          <Plus size={18} /> Nuevo Vendedor
        </button>
      </div>

      {/* Sellers List */}
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Rol</th>
              <th>PIN</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sellers?.map(seller => (
              <tr key={seller.id} style={{ opacity: seller.active ? 1 : 0.5 }}>
                <td style={{ fontWeight: 500 }}>
                  {seller.name}
                  {seller.id === currentSeller?.id && <span className="badge badge-fresh" style={{ marginLeft: 8 }}>Tú</span>}
                </td>
                <td>
                  {seller.role === 'admin' ? (
                    <span className="badge badge-warning"><Shield size={12} /> Admin</span>
                  ) : (
                    <span className="badge"><Users size={12} /> Vendedor</span>
                  )}
                </td>
                <td>••••</td>
                <td>
                  <span className={`badge ${seller.active ? 'badge-success' : 'badge-danger'}`}>
                    {seller.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => editSeller(seller)} title="Editar">
                      <Edit size={14} />
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowLogs(seller.id)} title="Ver Actividad">
                      <Activity size={14} />
                    </button>
                    <button 
                      className="btn btn-ghost btn-sm" 
                      onClick={() => toggleActive(seller)}
                      disabled={seller.id === currentSeller?.id}
                      title={seller.active ? 'Desactivar' : 'Activar'}
                    >
                      {seller.active ? <XCircle size={14} /> : <CheckCircle size={14} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Audit Logs Modal */}
      {showLogs && (
        <div className="modal-overlay" onClick={() => setShowLogs(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Actividad Reciente</h2>
              <button className="modal-close" onClick={() => setShowLogs(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {auditLogs?.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>Sin actividad registrada</p>
              ) : (
                <ul className="audit-list">
                  {auditLogs?.map(log => (
                    <li key={log.id} className="audit-item">
                      <div className="audit-date">{format(new Date(log.createdAt), 'dd/MM HH:mm')}</div>
                      <div className="audit-action">
                        <strong>{log.action}</strong>: {log.details}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
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
                <input 
                  type="text" 
                  className="form-input" 
                  value={form.name} 
                  onChange={e => updateField('name', e.target.value)} 
                  placeholder="Ej: Juan Pérez"
                  autoFocus
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">PIN de Acceso (4 dígitos)</label>
                <div style={{ position: 'relative' }}>
                  <Key size={16} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--color-text-secondary)' }} />
                  <input 
                    type="tel" 
                    className="form-input" 
                    style={{ paddingLeft: 35 }}
                    value={form.pin} 
                    onChange={e => updateField('pin', e.target.value)} 
                    placeholder="Ej: 1234"
                    maxLength={6}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Rol de Usuario</label>
                <div className="role-selector">
                  <label className={`role-option ${form.role === 'seller' ? 'selected' : ''}`}>
                    <input 
                      type="radio" 
                      name="role" 
                      value="seller" 
                      checked={form.role === 'seller'} 
                      onChange={() => updateField('role', 'seller')} 
                    />
                    <Users size={20} />
                    <div>
                      <strong>Vendedor</strong>
                      <small>Solo Vender y Caja</small>
                    </div>
                  </label>

                  <label className={`role-option ${form.role === 'admin' ? 'selected' : ''}`}>
                    <input 
                      type="radio" 
                      name="role" 
                      value="admin" 
                      checked={form.role === 'admin'} 
                      onChange={() => updateField('role', 'admin')} 
                    />
                    <Shield size={20} />
                    <div>
                      <strong>Administrador</strong>
                      <small>Acceso Total</small>
                    </div>
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSubmit}>
                {editingId ? 'Actualizar' : 'Crear Usuario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
