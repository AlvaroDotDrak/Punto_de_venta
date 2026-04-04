/**
 * Insumos — Gestión de ingredientes y stock
 * V3.0: consume FastAPI backend
 */
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import { Package, Plus, Search, AlertTriangle, Edit, X, ArrowDown, ArrowUp } from 'lucide-react';

const units = ['kg', 'gr', 'l', 'ml', 'unidad', 'docena'];
const emptyForm = { name: '', unit: 'kg', current_stock: 0, min_stock: 0, last_price: 0, category: 'reposteria' };

export default function Insumos() {
  const toast = useToast();

  const [ingredients, setIngredients] = useState([]);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('inventory');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showPurchase, setShowPurchase] = useState(null);
  const [purchaseForm, setPurchaseForm] = useState({ quantity: '', cost: '' });

  const loadData = async () => {
    const data = await api.get('/ingredients').catch(() => []);
    setIngredients(data);
  };

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    if (!search) return ingredients;
    const t = search.toLowerCase();
    return ingredients.filter(i => i.name.toLowerCase().includes(t));
  }, [ingredients, search]);

  const lowStock = ingredients.filter(i => i.current_stock <= i.min_stock);

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    try {
      if (editingId) {
        await api.patch(`/ingredients/${editingId}`, form);
        toast.success('Insumo actualizado');
      } else {
        await api.post('/ingredients', form);
        toast.success('Insumo creado');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      loadData();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  const handlePurchase = async () => {
    const qty = parseFloat(purchaseForm.quantity);
    if (!qty || qty <= 0) { toast.error('La cantidad debe ser mayor a 0'); return; }
    try {
      await api.post(`/ingredients/${showPurchase.id}/movements`, {
        type: 'purchase',
        quantity: qty,
        cost: parseFloat(purchaseForm.cost) || null,
      });
      toast.success('Compra registrada');
      setShowPurchase(null);
      setPurchaseForm({ quantity: '', cost: '' });
      loadData();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><Package size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />Insumos</h1>
        <button className="btn btn-primary" onClick={() => { setEditingId(null); setForm(emptyForm); setShowForm(true); }}>
          <Plus size={16} /> Nuevo Insumo
        </button>
      </div>

      {lowStock.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 'var(--space-md)' }}>
          <AlertTriangle size={16} />
          <strong>{lowStock.length} insumo(s) con stock bajo:</strong> {lowStock.map(i => i.name).join(', ')}
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
        <div className="search-bar" style={{ flex: 1 }}>
          <Search className="search-icon" size={16} />
          <input type="text" placeholder="Buscar insumo..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr><th>Nombre</th><th>Categoría</th><th>Stock actual</th><th>Stock mínimo</th><th>Último precio</th><th>Estado</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {filtered.map(ing => {
              const isLow = ing.current_stock <= ing.min_stock;
              return (
                <tr key={ing.id}>
                  <td style={{ fontWeight: 600 }}>{ing.name}</td>
                  <td style={{ fontSize: '0.85rem' }}>{ing.category}</td>
                  <td>{ing.current_stock} {ing.unit}</td>
                  <td>{ing.min_stock} {ing.unit}</td>
                  <td>{formatCurrency(ing.last_price)}</td>
                  <td>
                    {isLow
                      ? <span className="badge badge-danger"><AlertTriangle size={12} /> Bajo</span>
                      : <span className="badge badge-fresh">OK</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => {
                        setEditingId(ing.id);
                        setForm({ name: ing.name, unit: ing.unit, current_stock: ing.current_stock, min_stock: ing.min_stock, last_price: ing.last_price, category: ing.category || 'reposteria' });
                        setShowForm(true);
                      }}><Edit size={14} /></button>
                      <button className="btn btn-primary btn-sm" onClick={() => { setShowPurchase(ing); setPurchaseForm({ quantity: '', cost: '' }); }}>
                        <ArrowDown size={14} /> Comprar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'Editar Insumo' : 'Nuevo Insumo'}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                <div className="form-group">
                  <label className="form-label">Unidad</label>
                  <select className="form-input" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                    {units.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Categoría</label>
                  <input className="form-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Stock inicial</label>
                  <input className="form-input" type="number" min="0" value={form.current_stock} onChange={e => setForm(f => ({ ...f, current_stock: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Stock mínimo</label>
                  <input className="form-input" type="number" min="0" value={form.min_stock} onChange={e => setForm(f => ({ ...f, min_stock: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSubmit}>{editingId ? 'Guardar' : 'Crear'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Purchase modal */}
      {showPurchase && (
        <div className="modal-overlay" onClick={() => setShowPurchase(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Registrar Compra — {showPurchase.name}</h2>
              <button className="modal-close" onClick={() => setShowPurchase(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                <div className="form-group">
                  <label className="form-label">Cantidad ({showPurchase.unit})</label>
                  <input className="form-input" type="number" min="0.01" step="0.01" value={purchaseForm.quantity}
                    onChange={e => setPurchaseForm(f => ({ ...f, quantity: e.target.value }))} autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Costo total</label>
                  <input className="form-input" type="number" min="0" value={purchaseForm.cost}
                    onChange={e => setPurchaseForm(f => ({ ...f, cost: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowPurchase(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handlePurchase}>Registrar Compra</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
