import { useState } from 'react';
import api from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { X, Plus, Check, Pencil, Trash2 } from 'lucide-react';

export default function CategoryManagerModal({ categories, onClose, onReload }) {
  const toast = useToast();
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [confirmId, setConfirmId] = useState(null);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) { toast.error('Escribe un nombre'); return; }
    setAdding(true);
    try {
      await api.post('/expense-categories', { name, description: newDesc.trim() || null });
      toast.success('Categoría agregada');
      setNewName('');
      setNewDesc('');
      await onReload();
    } catch (err) {
      toast.error('Error: ' + err.message);
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (c) => {
    setConfirmId(null);
    setEditingId(c.id);
    setEditName(c.name);
    setEditDesc(c.description || '');
  };

  const handleSaveEdit = async (id) => {
    const name = editName.trim();
    if (!name) { toast.error('El nombre no puede quedar vacío'); return; }
    try {
      await api.patch(`/expense-categories/${id}`, { name, description: editDesc.trim() || null });
      toast.success('Categoría actualizada');
      setEditingId(null);
      await onReload();
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleDeactivate = async (id) => {
    try {
      await api.patch(`/expense-categories/${id}`, { active: false });
      toast.success('Categoría desactivada');
      setConfirmId(null);
      await onReload();
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Categorías de gasto</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 130 }}>
              <label className="form-label">Nueva categoría</label>
              <input className="form-input" value={newName} maxLength={60}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder="Ej: Insumos de aseo" />
            </div>
            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 130 }}>
              <label className="form-label">Descripción <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>(opcional)</span></label>
              <input className="form-input" value={newDesc} maxLength={120}
                onChange={e => setNewDesc(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()} />
            </div>
            <button className="btn btn-primary" onClick={handleAdd} disabled={adding}>
              <Plus size={16} /> Agregar
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
            {categories.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: 'var(--space-sm)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
                {editingId === c.id ? (
                  <>
                    <input className="form-input" style={{ flex: 1, minWidth: 0 }} value={editName} maxLength={60}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSaveEdit(c.id)} autoFocus />
                    <input className="form-input" style={{ flex: 1, minWidth: 0 }} value={editDesc} maxLength={120}
                      onChange={e => setEditDesc(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSaveEdit(c.id)} placeholder="Descripción" />
                    <button className="btn btn-primary btn-sm" onClick={() => handleSaveEdit(c.id)} title="Guardar"><Check size={14} /></button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)} title="Cancelar"><X size={14} /></button>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      {c.description && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{c.description}</div>}
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(c)} title="Editar"><Pencil size={14} /></button>
                    {confirmId === c.id ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeactivate(c.id)}>Quitar</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>No</button>
                      </div>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(c.id)} title="Desactivar" style={{ color: 'var(--color-danger)' }}><Trash2 size={14} /></button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          <p style={{ marginTop: 'var(--space-md)', fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
            Al quitar una categoría se oculta para nuevos gastos; los gastos ya registrados con ella se conservan.
          </p>
        </div>
      </div>
    </div>
  );
}
