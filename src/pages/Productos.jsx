/**
 * Productos — CRUD del catálogo de productos
 * V3.0: consume FastAPI backend
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import { formatCurrency } from '../utils/formatters';
import { Package, Plus, Search, X, Edit, Camera, Upload, Trash2 } from 'lucide-react';

const categories = [
  { value: 'vitrina', label: 'Vitrina 🍰' },
  { value: 'salados', label: 'Salados 🥪' },
  { value: 'encargo', label: 'Encargo 🎂' },
  { value: 'bebidas', label: 'Bebidas 🥤' },
  { value: 'cafe', label: 'Café ☕' },
];

const categoryEmoji = { vitrina: '🍰', salados: '🥪', encargo: '🎂', bebidas: '🥤', cafe: '☕' };

const emptyForm = { name: '', category: 'vitrina', price: '', slice_price: '', max_showcase_hours: '48', noFreshness: false, photo: null, slices: 8, stock: '' };

function resizeImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const maxSize = 400;
        let w = img.width, h = img.height;
        if (w > h) { if (w > maxSize) { h = (h * maxSize) / w; w = maxSize; } }
        else { if (h > maxSize) { w = (w * maxSize) / h; h = maxSize; } }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function Productos() {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('todos');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const loadProducts = async () => {
    const data = await api.get('/products?active_only=false').catch(() => []);
    setProducts(data);
  };

  useEffect(() => { loadProducts(); }, []);

  const filtered = useMemo(() => {
    let list = products;
    if (filterCategory !== 'todos') list = list.filter(p => p.category === filterCategory);
    if (search) list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [products, search, filterCategory]);

  const updateField = (f, v) => setForm(prev => ({ ...prev, [f]: v }));

  const handlePhoto = async (file) => {
    if (!file) return;
    const base64 = await resizeImage(file);
    updateField('photo', base64);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    const price = parseFloat(form.price);
    if (isNaN(price) || price <= 0) { toast.error('El precio debe ser mayor a 0'); return; }

    const slicePrice = parseFloat(form.slice_price);
    const payload = {
      name: form.name.trim(),
      category: form.category,
      price,
      slice_price: form.category === 'vitrina' && slicePrice > 0 ? slicePrice : null,
      max_showcase_hours: form.noFreshness ? null : (parseInt(form.max_showcase_hours) || 48),
      slices: parseInt(form.slices) || 8,
      photo: form.photo || null,
      stock: form.category === 'bebidas' ? (parseInt(form.stock) || 0) : null,
    };

    try {
      if (editingId) {
        await api.patch(`/products/${editingId}`, payload);
        toast.success('Producto actualizado');
      } else {
        await api.post('/products', payload);
        toast.success('Producto creado');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      loadProducts();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  const handleEdit = (p) => {
    setEditingId(p.id);
    setForm({ name: p.name, category: p.category, price: String(p.price), slice_price: p.slice_price != null ? String(p.slice_price) : '', max_showcase_hours: String(p.max_showcase_hours ?? 48), noFreshness: p.max_showcase_hours == null, photo: p.photo, slices: p.slices, stock: p.stock != null ? String(p.stock) : '' });
    setShowForm(true);
  };

  const handleDelete = async (p) => {
    if (!confirm(`¿Desactivar "${p.name}"?`)) return;
    try {
      await api.delete(`/products/${p.id}`);
      toast.success('Producto desactivado');
      loadProducts();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><Package size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />Productos</h1>
        <button className="btn btn-primary" onClick={() => { setEditingId(null); setForm(emptyForm); setShowForm(true); }}>
          <Plus size={16} /> Nuevo Producto
        </button>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
          <Search className="search-icon" size={18} />
          <input type="text" placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="tabs">
          {['todos', ...categories.map(c => c.value)].map(c => (
            <button key={c} className={`tab ${filterCategory === c ? 'active' : ''}`}
              onClick={() => setFilterCategory(c)}>
              {c === 'todos' ? 'Todos' : categories.find(x => x.value === c)?.label}
            </button>
          ))}
        </div>
      </div>

      <div className="products-grid">
        {filtered.map(p => (
          <div key={p.id} className={`product-card ${!p.active ? 'inactive' : ''}`}>
            {p.photo
              ? <img src={p.photo} alt={p.name} className="product-card-photo" />
              : <div className="product-card-emoji">{categoryEmoji[p.category] || '🍞'}</div>}
            <div className="product-card-body">
              <h4>{p.name}</h4>
              <div className="product-card-meta">
                <span className="badge badge-info">{categories.find(c => c.value === p.category)?.label}</span>
                <strong>{formatCurrency(p.price)}</strong>
              </div>
              {p.category === 'vitrina' && (
                <small style={{ color: 'var(--color-text-light)' }}>
                  {p.slices} trozos · {p.max_showcase_hours != null ? `${p.max_showcase_hours}h` : 'Sin control'}
                  {p.slice_price != null && <> · trozo {formatCurrency(p.slice_price)}</>}
                </small>
              )}
              {p.category === 'bebidas' && p.stock != null && (
                <small style={{ color: p.stock > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  Stock: {p.stock} unidades
                </small>
              )}
            </div>
            <div className="product-card-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(p)}><Edit size={14} /></button>
              {p.active && (
                <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(p)}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'Editar Producto' : 'Nuevo Producto'}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">

              {/* Nombre */}
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input className="form-input" value={form.name} onChange={e => updateField('name', e.target.value)} autoFocus />
              </div>

              {/* Categoría */}
              <div className="form-group">
                <label className="form-label">Categoría</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                  {categories.map(c => (
                    <button key={c.value} className={`btn btn-sm ${form.category === c.value ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => updateField('category', c.value)}>{c.label}</button>
                  ))}
                </div>
              </div>

              {/* Precio + campo secundario según categoría */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Precio *</label>
                  <input className="form-input" type="number" min="1" value={form.price} onChange={e => updateField('price', e.target.value)} />
                </div>
                {form.category === 'vitrina' && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Trozos por unidad</label>
                    <input className="form-input" type="number" min="1" max="32" value={form.slices} onChange={e => updateField('slices', parseInt(e.target.value) || 8)} />
                  </div>
                )}
              </div>

              {form.category === 'vitrina' && (
              <div className="form-group">
                <label className="form-label">Precio por trozo</label>
                <input
                  className="form-input"
                  type="number"
                  min="1"
                  step="100"
                  placeholder="Ej: 3000"
                  value={form.slice_price}
                  onChange={e => updateField('slice_price', e.target.value)}
                />
                <small style={{ color: 'var(--color-text-light)', fontSize: '0.78rem' }}>
                  Si se deja vacío, el precio del trozo se calculará al momento de trozar.
                </small>
              </div>
              )}

              {form.category === 'bebidas' && (
                <div className="form-group">
                  <label className="form-label">Stock inicial (unidades)</label>
                  <input className="form-input" type="number" min="0" value={form.stock} onChange={e => updateField('stock', e.target.value)} placeholder="0" />
                </div>
              )}

              {/* Horas en vitrina — solo para categorías con exposición */}
              {['vitrina', 'salados'].includes(form.category) && (
                <div className="form-group">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-xs)' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Horas en vitrina</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.82rem', color: 'var(--color-text-secondary)', cursor: 'pointer', fontWeight: 500 }}>
                      <input
                        type="checkbox"
                        checked={form.noFreshness}
                        onChange={e => updateField('noFreshness', e.target.checked)}
                      />
                      Sin control de tiempo
                    </label>
                  </div>
                  {!form.noFreshness && (
                    <input className="form-input" type="number" min="1" value={form.max_showcase_hours} onChange={e => updateField('max_showcase_hours', e.target.value)} />
                  )}
                </div>
              )}

              {/* Foto */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Foto</label>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                  {form.photo && <img src={form.photo} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />}
                  <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={14} /> Archivo
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => cameraInputRef.current?.click()}>
                    <Camera size={14} /> Cámara
                  </button>
                  {form.photo && <button className="btn btn-ghost btn-sm" onClick={() => updateField('photo', null)}>Quitar</button>}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={e => handlePhoto(e.target.files[0])} />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={e => handlePhoto(e.target.files[0])} />
              </div>

            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSubmit}>{editingId ? 'Guardar' : 'Crear'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
