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
];

const emptyForm = { name: '', category: 'vitrina', price: '', max_showcase_hours: '48', photo: null, slices: 8 };

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

    const payload = {
      name: form.name.trim(),
      category: form.category,
      price,
      max_showcase_hours: parseInt(form.max_showcase_hours) || 48,
      slices: parseInt(form.slices) || 8,
      photo: form.photo || null,
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
    setForm({ name: p.name, category: p.category, price: String(p.price), max_showcase_hours: String(p.max_showcase_hours), photo: p.photo, slices: p.slices });
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
              : <div className="product-card-emoji">{p.category === 'vitrina' ? '🍰' : p.category === 'salados' ? '🥪' : '🎂'}</div>}
            <div className="product-card-body">
              <h4>{p.name}</h4>
              <div className="product-card-meta">
                <span className="badge badge-info">{categories.find(c => c.value === p.category)?.label}</span>
                <strong>{formatCurrency(p.price)}</strong>
              </div>
              {p.category === 'vitrina' && (
                <small style={{ color: 'var(--color-text-light)' }}>
                  {p.slices} trozos · {p.max_showcase_hours}h
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
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input className="form-input" value={form.name} onChange={e => updateField('name', e.target.value)} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Categoría</label>
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  {categories.map(c => (
                    <button key={c.value} className={`btn ${form.category === c.value ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => updateField('category', c.value)}>{c.label}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                <div className="form-group">
                  <label className="form-label">Precio *</label>
                  <input className="form-input" type="number" min="1" value={form.price} onChange={e => updateField('price', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Horas en vitrina</label>
                  <input className="form-input" type="number" min="1" value={form.max_showcase_hours} onChange={e => updateField('max_showcase_hours', e.target.value)} />
                </div>
              </div>
              {form.category === 'vitrina' && (
                <div className="form-group">
                  <label className="form-label">Trozos por unidad</label>
                  <input className="form-input" type="number" min="1" max="32" value={form.slices} onChange={e => updateField('slices', parseInt(e.target.value) || 8)} />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Foto</label>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                  {form.photo && <img src={form.photo} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />}
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
