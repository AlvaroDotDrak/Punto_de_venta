import { useState } from 'react';
import api from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { X, Plus, Check, Pencil, Trash2 } from 'lucide-react';

const EMPTY = { name: '', rut: '', phone: '', email: '', notes: '' };

export default function SupplierManagerModal({ suppliers, onClose, onReload }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const resetForm = () => { setForm(EMPTY); setEditingId(null); };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) { toast.error('El nombre es obligatorio'); return; }
    const payload = {
      name,
      rut: form.rut.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
    };
    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/suppliers/${editingId}`, payload);
        toast.success('Proveedor actualizado');
      } else {
        await api.post('/suppliers', payload);
        toast.success('Proveedor agregado');
      }
      resetForm();
      await onReload();
    } catch (err) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (s) => {
    setConfirmId(null);
    setEditingId(s.id);
    setForm({ name: s.name || '', rut: s.rut || '', phone: s.phone || '', email: s.email || '', notes: s.notes || '' });
  };

  const handleDeactivate = async (id) => {
    try {
      await api.patch(`/suppliers/${id}`, { active: false });
      toast.success('Proveedor desactivado');
      setConfirmId(null);
      if (editingId === id) resetForm();
      await onReload();
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{editingId ? 'Editar proveedor' : 'Proveedores'}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ margin: 0, flex: 2, minWidth: 160 }}>
                <label className="form-label">Nombre *</label>
                <input className="form-input" value={form.name} maxLength={80}
                  onChange={e => set('name', e.target.value)} placeholder="Ej: Distribuidora Andina" />
              </div>
              <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 120 }}>
                <label className="form-label">RUT</label>
                <input className="form-input" value={form.rut} maxLength={20}
                  onChange={e => set('rut', e.target.value)} placeholder="76.123.456-7" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', marginTop: 'var(--space-sm)' }}>
              <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 120 }}>
                <label className="form-label">Teléfono</label>
                <input className="form-input" value={form.phone} maxLength={30}
                  onChange={e => set('phone', e.target.value)} placeholder="+56 9 ..." />
              </div>
              <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 120 }}>
                <label className="form-label">Email</label>
                <input className="form-input" value={form.email} maxLength={80}
                  onChange={e => set('email', e.target.value)} placeholder="ventas@..." />
              </div>
            </div>
            <div className="form-group" style={{ margin: '0', marginTop: 'var(--space-sm)' }}>
              <label className="form-label">Notas <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>(opcional)</span></label>
              <input className="form-input" value={form.notes} maxLength={200}
                onChange={e => set('notes', e.target.value)} placeholder="Condiciones de pago, contacto, etc." />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {editingId ? <><Check size={16} /> Guardar cambios</> : <><Plus size={16} /> Agregar proveedor</>}
              </button>
              {editingId && (
                <button className="btn btn-ghost" onClick={resetForm}>Cancelar</button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
            {suppliers.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', textAlign: 'center', padding: 'var(--space-md)' }}>
                Aún no hay proveedores. Agrega el primero arriba.
              </p>
            ) : suppliers.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: 'var(--space-sm)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: editingId === s.id ? 'var(--color-primary-bg)' : undefined }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {s.name}
                    {s.rut && <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}> · {s.rut}</span>}
                  </div>
                  {(s.phone || s.email) && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                      {[s.phone, s.email].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => startEdit(s)} title="Editar"><Pencil size={14} /></button>
                {confirmId === s.id ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeactivate(s.id)}>Quitar</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>No</button>
                  </div>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(s.id)} title="Desactivar" style={{ color: 'var(--color-danger)' }}><Trash2 size={14} /></button>
                )}
              </div>
            ))}
          </div>
          <p style={{ marginTop: 'var(--space-md)', fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
            Al quitar un proveedor se oculta para nuevos gastos; los gastos ya registrados con él se conservan.
          </p>
        </div>
      </div>
    </div>
  );
}
