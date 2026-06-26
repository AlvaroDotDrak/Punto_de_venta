import { useState } from 'react';
import api from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { useConfig } from '../../context/ConfigContext';
import { X, Package, Wheat } from 'lucide-react';

const UNITS = ['unidad', 'kg', 'gr', 'l', 'ml', 'docena'];

/**
 * Creación rápida de un producto o insumo desde una línea de compra,
 * sin salir de la factura en curso.
 */
export default function QuickCreateItemModal({ kind, initialName, defaultCost, onCreated, onClose }) {
  const toast = useToast();
  const { categories } = useConfig();
  const [name, setName] = useState(initialName || '');
  const [category, setCategory] = useState(categories[0]?.value || '');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('unidad');
  const [saving, setSaving] = useState(false);

  const isProduct = kind === 'product';

  const handleSave = async () => {
    if (!name.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (isProduct && !category) { toast.error('Selecciona una categoría'); return; }
    setSaving(true);
    try {
      let created;
      if (isProduct) {
        created = await api.post('/products', {
          name: name.trim(),
          category,
          price: parseFloat(price) || 0,
          cost_price: defaultCost ? parseFloat(defaultCost) : null,
          stock: 0,
        });
        toast.success('Producto creado');
      } else {
        created = await api.post('/ingredients', { name: name.trim(), unit });
        toast.success('Insumo creado');
      }
      onCreated(created);
    } catch (err) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isProduct ? <Package size={18} /> : <Wheat size={18} />}
            {isProduct ? 'Nuevo producto' : 'Nuevo insumo'}
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Nombre *</label>
            <input className="form-input" value={name} maxLength={80} autoFocus
              onChange={e => setName(e.target.value)} />
          </div>

          {isProduct ? (
            <>
              <div className="form-group">
                <label className="form-label">Categoría *</label>
                <select className="form-select" value={category} onChange={e => setCategory(e.target.value)}>
                  {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Precio de venta <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>(lo puedes ajustar luego)</span></label>
                <input type="number" min="0" step="any" className="form-input" value={price}
                  onChange={e => setPrice(e.target.value)} placeholder="0" />
              </div>
            </>
          ) : (
            <div className="form-group">
              <label className="form-label">Unidad de medida</label>
              <select className="form-select" value={unit} onChange={e => setUnit(e.target.value)}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          )}
          <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
            El stock y el costo se actualizan al registrar esta compra.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className={`btn btn-primary ${saving ? 'btn-loading' : ''}`} onClick={handleSave} disabled={saving}>
            {saving ? 'Creando...' : 'Crear y usar'}
          </button>
        </div>
      </div>
    </div>
  );
}
