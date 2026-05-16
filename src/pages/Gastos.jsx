import { useState, useEffect, useRef } from 'react';
import { useSeller } from '../context/SellerContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import { PlusCircle, Trash2, Image, X, FileText, Receipt } from 'lucide-react';

const today = () => new Date().toISOString().slice(0, 10);

const DOC_TYPES = [
  { value: 'boleta', label: 'Boleta / Vale', icon: Receipt, hint: 'Sin crédito fiscal' },
  { value: 'factura', label: 'Factura', icon: FileText, hint: 'Genera crédito fiscal IVA' },
];

export default function Gastos() {
  const { currentSeller } = useSeller();
  const toast = useToast();
  const isAdmin = currentSeller?.role === 'admin';
  const fileInputRef = useRef(null);

  const [categories, setCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Filtros (solo admin)
  const [filterFrom, setFilterFrom] = useState(today());
  const [filterTo, setFilterTo] = useState(today());
  const [filterCategory, setFilterCategory] = useState('');

  // Formulario
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [receiptPhoto, setReceiptPhoto] = useState(null);
  const [documentType, setDocumentType] = useState('boleta');

  // Modal foto preview
  const [previewPhoto, setPreviewPhoto] = useState(null);

  // Confirmar eliminación
  const [deletingId, setDeletingId] = useState(null);

  const loadCategories = async () => {
    try {
      const data = await api.get('/expense-categories');
      setCategories(data);
      if (data.length > 0 && !categoryId) setCategoryId(String(data[0].id));
    } catch (err) {
      toast.error('Error al cargar categorías: ' + err.message);
    }
  };

  const loadExpenses = async () => {
    const params = new URLSearchParams();
    if (isAdmin) {
      if (filterFrom) params.set('date_from', filterFrom);
      if (filterTo) params.set('date_to', filterTo);
      if (filterCategory) params.set('category_id', filterCategory);
    } else {
      params.set('date_from', today());
      params.set('date_to', today());
    }
    const data = await api.get(`/expenses?${params}`);
    setExpenses(data);
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    setLoading(true);
    loadExpenses().finally(() => setLoading(false));
  }, [filterFrom, filterTo, filterCategory]);

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 600 * 1024) {
      toast.error('La foto debe ser menor a 600 KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setReceiptPhoto(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!categoryId || !amount || parseFloat(amount) <= 0) {
      toast.error('Selecciona categoría e ingresa un monto válido');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/expenses', {
        category_id: parseInt(categoryId),
        amount: parseFloat(amount),
        description: description.trim() || null,
        receipt_photo: receiptPhoto || null,
        document_type: documentType,
      });
      toast.success('Gasto registrado');
      setAmount('');
      setDescription('');
      setReceiptPhoto(null);
      setDocumentType('boleta');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadExpenses();
    } catch (err) {
      toast.error('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/expenses/${id}`);
      toast.success('Gasto eliminado');
      setDeletingId(null);
      await loadExpenses();
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const totalShown = expenses.reduce((s, e) => s + e.amount, 0);
  const totalFactura = expenses.filter(e => e.document_type === 'factura').reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Gastos</h1>
        <span className="badge badge-info">
          {isAdmin ? 'Vista administrador' : 'Vista vendedor'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 'var(--space-xl)', alignItems: 'start' }}>

        {/* ── Formulario ─────────────────────────────────────────────────── */}
        <div className="card">
          <h3 style={{ margin: '0 0 var(--space-md)', fontSize: '1rem', fontWeight: 600 }}>
            Registrar gasto
          </h3>
          <form onSubmit={handleSubmit}>

            {/* Tipo de documento */}
            <div className="form-group">
              <label className="form-label">Tipo de documento</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-xs)' }}>
                {DOC_TYPES.map(dt => {
                  const Icon = dt.icon;
                  const active = documentType === dt.value;
                  return (
                    <button
                      key={dt.value}
                      type="button"
                      onClick={() => setDocumentType(dt.value)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        gap: 4, padding: 'var(--space-sm)',
                        border: `2px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                        background: active ? 'color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))' : 'var(--color-surface)',
                        color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        fontWeight: active ? 600 : 400, fontSize: '0.8rem',
                        transition: 'all 0.15s',
                      }}
                    >
                      <Icon size={18} />
                      <span>{dt.label}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                        {dt.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Categoría</label>
              <select
                className="form-select"
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                required
              >
                <option value="">Selecciona...</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Monto ($) — total {documentType === 'factura' ? 'con IVA incluido' : 'pagado'}</label>
              <input
                type="number"
                className="form-input"
                placeholder="0"
                min="1"
                step="1"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
              />
              {documentType === 'factura' && amount && parseFloat(amount) > 0 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>
                  Crédito fiscal estimado: {formatCurrency(Math.round(parseFloat(amount) * 19 / 119))}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Descripción <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>(opcional)</span></label>
              <input
                type="text"
                className="form-input"
                placeholder="Ej: Compra harina para tortas"
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Comprobante <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>(opcional)</span></label>
              {receiptPhoto ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img
                    src={receiptPhoto}
                    alt="Comprobante"
                    style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: '1px solid var(--color-border)' }}
                    onClick={() => setPreviewPhoto(receiptPhoto)}
                  />
                  <button
                    type="button"
                    onClick={() => { setReceiptPhoto(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    style={{
                      position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)',
                      border: 'none', borderRadius: '50%', width: 24, height: 24,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: '#fff',
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <label
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--space-sm)',
                    border: '1.5px dashed var(--color-border)', borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: '0.875rem',
                  }}
                >
                  <Image size={16} />
                  <span>Subir foto</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handlePhotoChange}
                  />
                </label>
              )}
            </div>

            <button
              type="submit"
              className={`btn btn-primary ${submitting ? 'btn-loading' : ''}`}
              disabled={submitting}
              style={{ width: '100%' }}
            >
              <PlusCircle size={16} />
              {submitting ? 'Registrando...' : 'Registrar gasto'}
            </button>
          </form>
        </div>

        {/* ── Lista ──────────────────────────────────────────────────────── */}
        <div>
          {/* Filtros admin */}
          {isAdmin && (
            <div className="card" style={{ marginBottom: 'var(--space-md)', display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
                <label className="form-label">Desde</label>
                <input type="date" className="form-input" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
                <label className="form-label">Hasta</label>
                <input type="date" className="form-input" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0, minWidth: 160 }}>
                <label className="form-label">Categoría</label>
                <select className="form-select" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                  <option value="">Todas</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <button className="btn btn-secondary" onClick={loadExpenses}>Filtrar</button>
            </div>
          )}

          {/* Cabecera lista */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
              {isAdmin ? 'Gastos del período' : 'Gastos de hoy'}
            </h3>
            {expenses.length > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: 'var(--color-danger)' }}>
                  Total: {formatCurrency(totalShown)}
                </div>
                {totalFactura > 0 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                    Con factura: {formatCurrency(totalFactura)} · crédito fiscal ≈ {formatCurrency(Math.round(totalFactura * 19 / 119))}
                  </div>
                )}
              </div>
            )}
          </div>

          {loading ? (
            <div className="card" style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>
              Cargando...
            </div>
          ) : expenses.length === 0 ? (
            <div className="card empty-state">
              <span style={{ fontSize: '2rem' }}>💸</span>
              <h3>Sin gastos</h3>
              <p>{isAdmin ? 'No hay gastos en el período seleccionado' : 'No se han registrado gastos hoy'}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {expenses.map(expense => (
                <div
                  key={expense.id}
                  className="card"
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-md)' }}
                >
                  {expense.receipt_photo && (
                    <img
                      src={expense.receipt_photo}
                      alt="Comprobante"
                      style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 'var(--radius-sm)', cursor: 'pointer', flexShrink: 0 }}
                      onClick={() => setPreviewPhoto(expense.receipt_photo)}
                    />
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>{expense.category_name}</span>
                      <span
                        className={`badge ${expense.document_type === 'factura' ? 'badge-success' : ''}`}
                        style={{
                          fontSize: '0.7rem',
                          background: expense.document_type === 'factura' ? undefined : 'var(--color-bg)',
                          color: expense.document_type === 'factura' ? undefined : 'var(--color-text-secondary)',
                          border: expense.document_type === 'factura' ? undefined : '1px solid var(--color-border)',
                        }}
                      >
                        {expense.document_type === 'factura' ? '🧾 Factura' : 'Boleta'}
                      </span>
                      {expense.description && (
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {expense.description}
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                      {formatDate(expense.created_at)} · {expense.seller_name}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-danger)' }}>
                      {formatCurrency(expense.amount)}
                    </div>
                    {expense.document_type === 'factura' && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
                        CF: {formatCurrency(Math.round(expense.amount * 19 / 119))}
                      </div>
                    )}
                  </div>

                  {isAdmin && (
                    deletingId === expense.id ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(expense.id)}>Sí, eliminar</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setDeletingId(null)}>Cancelar</button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDeletingId(expense.id)}
                        title="Eliminar gasto"
                        style={{ color: 'var(--color-danger)' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal preview foto */}
      {previewPhoto && (
        <div className="modal-overlay" onClick={() => setPreviewPhoto(null)}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img src={previewPhoto} alt="Comprobante" style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 'var(--radius-md)' }} />
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setPreviewPhoto(null)}
              style={{ position: 'absolute', top: 8, right: 8 }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
