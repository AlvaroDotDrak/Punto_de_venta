/**
 * Productos — Product catalog with CRUD, photo management
 * Features: search, filter, photo upload/camera, price validation
 */
import { useState, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useToast } from '../context/ToastContext';
import { formatCurrency } from '../utils/formatters';
import { logAction, ACTIONS } from '../utils/auditLog';
import { useSeller } from '../context/SellerContext';
import { Package, Plus, Search, X, Edit, Camera, Upload, Image, Trash2 } from 'lucide-react';

const categories = [
  { value: 'vitrina', label: 'Vitrina 🍰' },
  { value: 'salados', label: 'Salados 🥪' },
  { value: 'encargo', label: 'Encargo 🎂' },
];

const emptyForm = {
  name: '', category: 'vitrina', price: '', maxShowcaseHours: '48', active: true, photo: null, description: '', slices: 8,
};

/**
 * Resize an image to max 400px and return Base64
 */
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
        canvas.width = w;
        canvas.height = h;
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
  const { currentSeller } = useSeller();
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('todos');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const products = useLiveQuery(() => db.products.toArray(), [], []);

  const filtered = useMemo(() => {
    let result = products;
    if (filterCategory !== 'todos') result = result.filter(p => p.category === filterCategory);
    if (search) {
      const term = search.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(term));
    }
    return result;
  }, [products, filterCategory, search]);

  const updateField = (field, value) => setForm(f => ({ ...f, [field]: value }));

  // Photo upload
  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten archivos de imagen');
      return;
    }
    try {
      const base64 = await resizeImage(file);
      setForm(f => ({ ...f, photo: base64 }));
      toast.success('Foto cargada');
    } catch {
      toast.error('Error al procesar la imagen');
    }
  };

  // Camera capture
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setShowCamera(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);
    } catch {
      toast.error('No se pudo acceder a la cámara');
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    const v = videoRef.current;
    const maxSize = 400;
    let w = v.videoWidth, h = v.videoHeight;
    if (w > h) { if (w > maxSize) { h = (h * maxSize) / w; w = maxSize; } }
    else { if (h > maxSize) { w = (w * maxSize) / h; h = maxSize; } }
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(v, 0, 0, w, h);
    const base64 = canvas.toDataURL('image/jpeg', 0.8);
    setForm(f => ({ ...f, photo: base64 }));
    stopCamera();
    toast.success('Foto capturada');
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  // Save product — validate price > 0
  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    const price = parseInt(form.price);
    if (isNaN(price) || price <= 0) {
      toast.error('El precio debe ser mayor a $0');
      return;
    }

    const productData = {
      name: form.name.trim(),
      category: form.category,
      price,
      maxShowcaseHours: parseInt(form.maxShowcaseHours) || 48,
      slices: parseInt(form.slices) || 8, // Guardar porciones (default 8)
      active: form.active,
      photo: form.photo || null,
      description: form.description?.trim() || '',
    };

    try {
      if (editingId) {
        await db.products.update(editingId, { ...productData, updatedAt: new Date().toISOString() });
        toast.success('Producto actualizado');
        await logAction(ACTIONS.PRODUCT_UPDATE, currentSeller?.id, `${form.name}`);
      } else {
        productData.createdAt = new Date().toISOString();
        await db.products.add(productData);
        toast.success('Producto creado');
        await logAction(ACTIONS.PRODUCT_CREATE, currentSeller?.id, `${form.name} - ${formatCurrency(price)}`);
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const editProduct = (product) => {
    setForm({
      name: product.name,
      category: product.category,
      price: product.price?.toString() || '',
      maxShowcaseHours: product.maxShowcaseHours?.toString() || '48',
      slices: product.slices || 8, // Cargar porciones existentes o default 8
      active: product.active !== false,
      photo: product.photo || null,
      description: product.description || '',
    });
    setEditingId(product.id);
    setShowForm(true);
  };

  const toggleActive = async (product) => {
    await db.products.update(product.id, { active: !product.active });
    toast.info(`${product.name} ${product.active ? 'desactivado' : 'activado'}`);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Package size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Catálogo de Productos
        </h1>
        <button className="btn btn-primary" onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); }}>
          <Plus size={18} /> Nuevo Producto
        </button>
      </div>

      {/* Search & Filter */}
      <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
          <Search className="search-icon" size={18} />
          <input type="text" placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="quick-filters">
          <button className={`quick-filter ${filterCategory === 'todos' ? 'active' : ''}`} onClick={() => setFilterCategory('todos')}>
            Todos ({products.length})
          </button>
          {categories.map(cat => (
            <button key={cat.value} className={`quick-filter ${filterCategory === cat.value ? 'active' : ''}`} onClick={() => setFilterCategory(cat.value)}>
              {cat.label} ({products.filter(p => p.category === cat.value).length})
            </button>
          ))}
        </div>
      </div>

      {/* Products Table */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <Package size={48} />
          <h3>Sin productos</h3>
          <p>Agrega tu primer producto al catálogo</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th style={{ width: 50 }}>Foto</th>
                <th>Nombre</th>
                <th>Categoría</th>
                <th>Precio</th>
                <th>Máx. Vitrina</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(product => (
                <tr key={product.id} style={{ opacity: product.active === false ? 0.5 : 1 }}>
                  <td>
                    {product.photo ? (
                      <img src={product.photo} alt={product.name} className="product-thumb" />
                    ) : (
                      <div className="product-thumb-empty">
                        <Image size={16} />
                      </div>
                    )}
                  </td>
                  <td style={{ fontWeight: 500 }}>{product.name}</td>
                  <td>{categories.find(c => c.value === product.category)?.label || product.category}</td>
                  <td style={{ fontWeight: 600 }}>{formatCurrency(product.price)}</td>
                  <td>{product.maxShowcaseHours ? `${product.maxShowcaseHours}h` : '—'}</td>
                  <td>
                    <span className={`badge ${product.active !== false ? 'badge-fresh' : 'badge-danger'}`}>
                      {product.active !== false ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => editProduct(product)}>
                        <Edit size={14} />
                      </button>
                      <button
                        className={`btn btn-sm ${product.active !== false ? 'btn-danger' : 'btn-success'}`}
                        onClick={() => toggleActive(product)}
                      >
                        {product.active !== false ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Product Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => { setShowForm(false); stopCamera(); }}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'Editar Producto' : 'Nuevo Producto'}</h2>
              <button className="modal-close" onClick={() => { setShowForm(false); stopCamera(); }}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {/* Photo section */}
              <div className="photo-upload-section">
                <div className="photo-preview">
                  {form.photo ? (
                    <div style={{ position: 'relative' }}>
                      <img src={form.photo} alt="Preview" className="photo-preview-img" />
                      <button className="photo-remove-btn" onClick={() => setForm(f => ({ ...f, photo: null }))}>
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="photo-placeholder">
                      <Image size={32} />
                      <span>Sin foto</span>
                    </div>
                  )}
                </div>
                <div className="photo-actions">
                  <label className="btn btn-secondary btn-sm">
                    <Upload size={14} /> Subir Foto
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
                  </label>
                  <button className="btn btn-secondary btn-sm" onClick={startCamera}>
                    <Camera size={14} /> Cámara
                  </button>
                </div>
              </div>

              {/* Camera Modal */}
              {showCamera && (
                <div className="camera-modal">
                  <video ref={videoRef} className="camera-video" autoPlay playsInline />
                  <div className="camera-controls">
                    <button className="btn btn-primary" onClick={capturePhoto}>
                      📸 Capturar
                    </button>
                    <button className="btn btn-secondary" onClick={stopCamera}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Nombre del Producto *</label>
                  <input type="text" className="form-input" placeholder="Ej: Torta de Chocolate" value={form.name} onChange={e => updateField('name', e.target.value)} autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Categoría</label>
                  <select className="form-select" value={form.category} onChange={e => updateField('category', e.target.value)}>
                    {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Precio (CLP) *</label>
                  <input type="number" className="form-input" placeholder="Debe ser mayor a 0" value={form.price} onChange={e => updateField('price', e.target.value)} min="1" />
                </div>
                <div className="form-group">
                  <label className="form-label">Máx. horas en vitrina</label>
                  <input type="number" className="form-input" placeholder="48" value={form.maxShowcaseHours} onChange={e => updateField('maxShowcaseHours', e.target.value)} />
                </div>
              </div>

              {/* Porciones por unidad (Solo para categoría Vitrina/Pasteles) */}
              {form.category === 'vitrina' && (
                <div className="form-group">
                  <label className="form-label">Porciones por Pastel</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="Ej: 8, 10, 12" 
                    value={form.slices} 
                    onChange={e => updateField('slices', e.target.value)} 
                    min="1" 
                  />
                  <small style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                    Define en cuántos trozos se corta este pastel.
                  </small>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Descripción / Ingredientes</label>
                <textarea
                  className="form-input"
                  placeholder="Ej: Bizcocho de vainilla con relleno de manjar y cobertura de chocolate..."
                  value={form.description}
                  onChange={e => updateField('description', e.target.value)}
                  rows={3}
                  maxLength={500}
                />
                <small style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                  {form.description?.length || 0}/500 — Visible para vendedores en el POS
                </small>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); stopCamera(); }}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSubmit}>
                {editingId ? 'Actualizar' : 'Crear Producto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
