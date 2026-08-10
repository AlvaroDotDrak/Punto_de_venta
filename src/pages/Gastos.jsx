import { useState, useEffect, useRef } from 'react';
import { useSeller } from '../context/SellerContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import { PlusCircle, Trash2, Image, X, FileText, Receipt, Tags, Truck, Pencil } from 'lucide-react';
import CategoryManagerModal from '../components/Gastos/CategoryManagerModal';
import SupplierManagerModal from '../components/Gastos/SupplierManagerModal';
import DateInput from '../components/DateInput';
import DateRangePresets from '../components/DateRangePresets';

const today = () => new Date().toISOString().slice(0, 10);

const DOC_TYPES = [
  { value: 'boleta', label: 'Boleta / Vale', icon: Receipt, hint: 'Sin crédito fiscal' },
  { value: 'factura', label: 'Factura', icon: FileText, hint: 'Genera crédito fiscal IVA' },
];

const PAYMENT_METHODS = [
  { value: 'efectivo', label: '💵 Efectivo' },
  { value: 'tarjeta', label: '💳 Tarjeta' },
  { value: 'debito', label: '💳 Débito' },
  { value: 'transferencia', label: '🏦 Transferencia' },
];

export default function Gastos() {
  const { currentSeller, isAdmin } = useSeller();
  const canManage = isAdmin || !!currentSeller?.can_manage_expenses;
  // Quien gestiona necesita ver lo que edita, así que el historial va incluido.
  const canViewHistory = canManage || !!currentSeller?.can_view_expense_history;
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Filtros (requieren permiso de historial)
  const [filterFrom, setFilterFrom] = useState(today());
  const [filterTo, setFilterTo] = useState(today());
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');

  // Formulario
  const [categoryId, setCategoryId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [receiptPhoto, setReceiptPhoto] = useState(null);
  const [documentType, setDocumentType] = useState('boleta');
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  // Solo aplica al efectivo: un sueldo o la feria se pagan en billetes que no
  // salieron del cajón del local, y descontarlos deja el arqueo en negativo.
  const [affectsCash, setAffectsCash] = useState(true);

  // Solo para avisar: un gasto en efectivo con la caja cerrada no descuenta del cajón
  const [cashOpen, setCashOpen] = useState(true);

  // Modal foto preview
  const [previewPhoto, setPreviewPhoto] = useState(null);

  // Confirmar eliminación
  const [deletingId, setDeletingId] = useState(null);

  // Edición de un gasto ya registrado
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Gestores (requieren permiso de gestión)
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showSupplierManager, setShowSupplierManager] = useState(false);

  const loadCategories = async () => {
    try {
      const data = await api.get('/expense-categories');
      setCategories(data);
      if (data.length > 0 && !categoryId) setCategoryId(String(data[0].id));
    } catch (err) {
      toast.error('Error al cargar categorías: ' + err.message);
    }
  };

  const loadSuppliers = async () => {
    try {
      const data = await api.get('/suppliers');
      setSuppliers(data);
    } catch (err) {
      toast.error('Error al cargar proveedores: ' + err.message);
    }
  };

  const loadExpenses = async () => {
    const params = new URLSearchParams();
    if (canViewHistory) {
      if (filterFrom) params.set('date_from', filterFrom);
      if (filterTo) params.set('date_to', filterTo);
      if (filterCategory) params.set('category_id', filterCategory);
      if (filterSupplier) params.set('supplier_id', filterSupplier);
    } else {
      params.set('date_from', today());
      params.set('date_to', today());
    }
    const data = await api.get(`/expenses?${params}`);
    setExpenses(data);
  };

  useEffect(() => {
    loadCategories();
    loadSuppliers();
    api.get('/cash/current').then(r => setCashOpen(!!r)).catch(() => setCashOpen(false));
  }, []);

  useEffect(() => {
    setLoading(true);
    loadExpenses().finally(() => setLoading(false));
  }, [filterFrom, filterTo, filterCategory, filterSupplier]);

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
      const creado = await api.post('/expenses', {
        category_id: parseInt(categoryId),
        amount: parseFloat(amount),
        description: description.trim() || null,
        receipt_photo: receiptPhoto || null,
        document_type: documentType,
        payment_method: paymentMethod,
        affects_cash: paymentMethod === 'efectivo' ? affectsCash : true,
        supplier_id: supplierId ? parseInt(supplierId) : null,
      });
      toast.success('Gasto registrado');
      if (creado?.cash_warning) toast.error(creado.cash_warning);
      setAmount('');
      setDescription('');
      setReceiptPhoto(null);
      setDocumentType('boleta');
      setPaymentMethod('efectivo');
      setAffectsCash(true);
      setSupplierId('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadExpenses();
    } catch (err) {
      toast.error('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (expense) => {
    setDeletingId(null);
    setEditing(expense);
    setEditForm({
      category_id: String(expense.category_id),
      supplier_id: expense.supplier_id ? String(expense.supplier_id) : '',
      amount: String(expense.amount),
      description: expense.description || '',
      document_type: expense.document_type || 'boleta',
      payment_method: expense.payment_method || 'efectivo',
      affects_cash: expense.affects_cash !== false,
    });
  };

  const handleSaveEdit = async () => {
    if (!editForm.category_id || !editForm.amount || parseFloat(editForm.amount) <= 0) {
      toast.error('Selecciona categoría e ingresa un monto válido');
      return;
    }
    setSavingEdit(true);
    try {
      const actualizado = await api.patch(`/expenses/${editing.id}`, {
        category_id: parseInt(editForm.category_id),
        amount: parseFloat(editForm.amount),
        description: editForm.description.trim() || null,
        document_type: editForm.document_type,
        payment_method: editForm.payment_method,
        affects_cash: editForm.payment_method === 'efectivo' ? editForm.affects_cash : true,
        supplier_id: editForm.supplier_id ? parseInt(editForm.supplier_id) : null,
      });
      toast.success('Gasto actualizado');
      if (actualizado?.cash_warning) toast.error(actualizado.cash_warning);
      setEditing(null);
      await loadExpenses();
    } catch (err) {
      toast.error('Error: ' + err.message);
    } finally {
      setSavingEdit(false);
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
          {canManage ? 'Gestión completa' : canViewHistory ? 'Consulta e historial' : 'Registro del día'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 'var(--space-xl)', alignItems: 'start' }}>

        {/* ── Formulario ─────────────────────────────────────────────────── */}
        <div className="card">
          <h3 style={{ margin: '0 0 var(--space-md)', fontSize: '1rem', fontWeight: 600 }}>
            Registrar gasto
          </h3>
          <form onSubmit={handleSubmit}>

            {/* Método de pago — define si el gasto descuenta del cajón */}
            <div className="form-group">
              <label className="form-label">¿Cómo se pagó?</label>
              <select className="form-input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                {PAYMENT_METHODS.map(pm => <option key={pm.value} value={pm.value}>{pm.label}</option>)}
              </select>
            </div>

            {/* Un gasto en efectivo no siempre sale del cajón del local */}
            {paymentMethod === 'efectivo' && (
              <div className="form-group">
                <label className="form-label">¿De dónde salió la plata?</label>
                <div style={{ display: 'grid', gap: 'var(--space-xs)' }}>
                  {[
                    { val: true, lbl: 'Del cajón de la caja', hint: 'Se descuenta del efectivo esperado' },
                    { val: false, lbl: 'De otro lado', hint: 'Banco, caja fuerte, bolsillo — no toca el cajón' },
                  ].map(op => (
                    <button
                      key={String(op.val)}
                      type="button"
                      onClick={() => setAffectsCash(op.val)}
                      style={{
                        textAlign: 'left', padding: 'var(--space-sm)', cursor: 'pointer',
                        border: `2px solid ${affectsCash === op.val ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        borderRadius: 'var(--radius-sm)',
                        background: affectsCash === op.val ? 'color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))' : 'var(--color-surface)',
                        color: affectsCash === op.val ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        fontWeight: affectsCash === op.val ? 600 : 400, fontSize: '0.85rem',
                      }}
                    >
                      {op.lbl}
                      <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 400, color: 'var(--color-text-secondary)' }}>
                        {op.hint}
                      </span>
                    </button>
                  ))}
                </div>
                {affectsCash && !cashOpen && (
                  <p style={{ marginTop: 6, fontSize: '0.78rem', lineHeight: 1.4, color: 'var(--color-danger)' }}>
                    La caja está cerrada: se registrará en contabilidad, pero no descontará del cajón.
                  </p>
                )}
              </div>
            )}

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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label className="form-label" style={{ margin: 0 }}>Categoría</label>
                {canManage && (
                  <button type="button" className="btn btn-ghost btn-sm"
                    onClick={() => setShowCategoryManager(true)}
                    style={{ fontSize: '0.75rem', padding: '2px 6px', gap: 4 }}>
                    <Tags size={13} /> Gestionar
                  </button>
                )}
              </div>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label className="form-label" style={{ margin: 0 }}>
                  Proveedor <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>(opcional)</span>
                </label>
                {canManage && (
                  <button type="button" className="btn btn-ghost btn-sm"
                    onClick={() => setShowSupplierManager(true)}
                    style={{ fontSize: '0.75rem', padding: '2px 6px', gap: 4 }}>
                    <Truck size={13} /> Gestionar
                  </button>
                )}
              </div>
              <select
                className="form-select"
                value={supplierId}
                onChange={e => setSupplierId(e.target.value)}
              >
                <option value="">— Sin proveedor —</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
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
          {/* Filtros (requieren permiso de historial) */}
          {canViewHistory && (
            <div className="card" style={{ marginBottom: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              <DateRangePresets
                from={filterFrom}
                to={filterTo}
                onSelect={(f, t) => { setFilterFrom(f); setFilterTo(t); }}
              />
              <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
                  <label className="form-label">Desde</label>
                  <DateInput className="form-input" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
                  <label className="form-label">Hasta</label>
                  <DateInput className="form-input" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0, minWidth: 160 }}>
                  <label className="form-label">Categoría</label>
                  <select className="form-select" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                    <option value="">Todas</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0, minWidth: 160 }}>
                  <label className="form-label">Proveedor</label>
                  <select className="form-select" value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}>
                    <option value="">Todos</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <button className="btn btn-secondary" onClick={loadExpenses}>Filtrar</button>
              </div>
            </div>
          )}

          {/* Cabecera lista */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
              {canViewHistory ? 'Gastos del período' : 'Gastos de hoy'}
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
              <p>{canViewHistory ? 'No hay gastos en el período seleccionado' : 'No se han registrado gastos hoy'}</p>
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
                      {expense.payment_method === 'efectivo' && expense.affects_cash === false && (
                        <span className="badge" style={{ fontSize: '0.7rem', background: 'var(--color-bg)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                          No sale del cajón
                        </span>
                      )}
                      {expense.description && (
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {expense.description}
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{formatDate(expense.created_at)} · {expense.seller_name}</span>
                      {expense.supplier_name && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          · <Truck size={12} /> {expense.supplier_name}
                        </span>
                      )}
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

                  {/* Una compra con líneas se corrige desde Compras (ahí sí se revierte
                      el stock que movió), así que acá solo la toca un admin */}
                  {canManage && (isAdmin || !expense.has_items) && (
                    deletingId === expense.id ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(expense.id)}>Sí, eliminar</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setDeletingId(null)}>Cancelar</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => startEdit(expense)}
                          title="Editar gasto"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setDeletingId(expense.id)}
                          title="Eliminar gasto"
                          style={{ color: 'var(--color-danger)' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Editar gasto */}
      {editing && editForm && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Editar gasto</h2>
              <button className="modal-close" onClick={() => setEditing(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Categoría</label>
                <select className="form-select" value={editForm.category_id}
                  onChange={e => setEditForm({ ...editForm, category_id: e.target.value })}>
                  <option value="">Selecciona...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Proveedor <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>(opcional)</span></label>
                <select className="form-select" value={editForm.supplier_id}
                  onChange={e => setEditForm({ ...editForm, supplier_id: e.target.value })}>
                  <option value="">— Sin proveedor —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Monto ($)</label>
                <input type="number" className="form-input" min="1" step="1" value={editForm.amount}
                  onChange={e => setEditForm({ ...editForm, amount: e.target.value })} />
              </div>

              <div className="form-group">
                <label className="form-label">Descripción</label>
                <input type="text" className="form-input" maxLength={200} value={editForm.description}
                  onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
              </div>

              <div className="form-group">
                <label className="form-label">Tipo de documento</label>
                <select className="form-select" value={editForm.document_type}
                  onChange={e => setEditForm({ ...editForm, document_type: e.target.value })}>
                  {DOC_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">¿Cómo se pagó?</label>
                <select className="form-select" value={editForm.payment_method}
                  onChange={e => setEditForm({ ...editForm, payment_method: e.target.value })}>
                  {PAYMENT_METHODS.map(pm => <option key={pm.value} value={pm.value}>{pm.label}</option>)}
                </select>
                <p style={{ marginTop: 6, fontSize: '0.78rem', lineHeight: 1.4, color: 'var(--color-text-secondary)' }}>
                  El movimiento de caja se ajusta solo si el turno del gasto sigue abierto;
                  un turno ya cerrado no se reescribe.
                </p>
              </div>

              {editForm.payment_method === 'efectivo' && (
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    id="edit_affects_cash"
                    checked={editForm.affects_cash}
                    onChange={e => setEditForm({ ...editForm, affects_cash: e.target.checked })}
                  />
                  <label htmlFor="edit_affects_cash" className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>
                    Salió del cajón de la caja
                  </label>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancelar</button>
              <button className={`btn btn-primary ${savingEdit ? 'btn-loading' : ''}`}
                onClick={handleSaveEdit} disabled={savingEdit}>
                {savingEdit ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gestor de categorías */}
      {showCategoryManager && (
        <CategoryManagerModal
          categories={categories}
          onClose={() => setShowCategoryManager(false)}
          onReload={loadCategories}
        />
      )}

      {/* Gestor de proveedores */}
      {showSupplierManager && (
        <SupplierManagerModal
          suppliers={suppliers}
          onClose={() => setShowSupplierManager(false)}
          onReload={loadSuppliers}
        />
      )}

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
