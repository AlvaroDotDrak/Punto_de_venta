/**
 * Compras — Registro de facturas de proveedor con detalle (Fase 2).
 * Cada línea puede reponer un producto, un insumo, o ser solo gasto.
 * El total se guarda como gasto (contabilidad/IVA); las líneas reponen stock y costo.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import { ShoppingBag, Plus, Trash2, Truck, FileText, Receipt, ChevronDown, ChevronUp, Package, Wheat, Tag } from 'lucide-react';
import ItemPicker from '../components/Compras/ItemPicker';
import QuickCreateItemModal from '../components/Compras/QuickCreateItemModal';

const IVA_RATE = 0.19;
const PAYMENT_METHODS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'debito', label: 'Débito' },
];
const KIND_OPTIONS = [
  { value: 'product', label: 'Producto', icon: Package },
  { value: 'ingredient', label: 'Insumo', icon: Wheat },
  { value: 'other', label: 'Otro', icon: Tag },
];

const emptyLine = (key) => ({ key, kind: 'product', refId: '', description: '', quantity: '', unitCost: '' });

export default function Compras() {
  const toast = useToast();
  const lineKey = useRef(1);

  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [ingredients, setIngredients] = useState([]);

  const [supplierId, setSupplierId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [documentType, setDocumentType] = useState('factura');
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState([emptyLine(0)]);
  const [submitting, setSubmitting] = useState(false);

  const [purchases, setPurchases] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  // Creación rápida de producto/insumo desde una línea: { lineKey, kind, name }
  const [quickCreate, setQuickCreate] = useState(null);

  const loadRefs = async () => {
    try {
      const [cats, sups, prods, ings] = await Promise.all([
        api.get('/expense-categories'),
        api.get('/suppliers'),
        api.get('/products?active_only=false'),
        api.get('/ingredients'),
      ]);
      setCategories(cats);
      setSuppliers(sups);
      setProducts(prods);
      setIngredients(ings);
      if (cats.length > 0) setCategoryId(prev => prev || String(cats[0].id));
    } catch (err) {
      toast.error('Error al cargar datos: ' + err.message);
    }
  };

  const loadPurchases = async () => {
    try {
      const data = await api.get('/purchases?limit=30');
      setPurchases(data);
    } catch {
      // lista informativa
    }
  };

  useEffect(() => {
    loadRefs();
    loadPurchases();
  }, []);

  const updateLine = (key, patch) =>
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));

  const setLineKind = (key, kind) =>
    updateLine(key, { kind, refId: '', description: '' });

  const setLineRef = (key, kind, refId) => {
    let description = '';
    let lastCost = null;
    if (kind === 'product') {
      const p = products.find(x => String(x.id) === String(refId));
      description = p?.name || '';
      lastCost = p?.cost_price ?? null;
    } else if (kind === 'ingredient') {
      const i = ingredients.find(x => String(x.id) === String(refId));
      description = i ? `${i.name} (${i.unit})` : '';
      lastCost = i?.last_price ?? null;
    }
    setLines(prev => prev.map(l => {
      if (l.key !== key) return l;
      const patch = { refId: String(refId), description };
      // Pre-llenar el costo con el último conocido solo si la línea aún no tiene costo
      if ((l.unitCost === '' || l.unitCost == null) && lastCost) patch.unitCost = String(lastCost);
      return { ...l, ...patch };
    }));
  };

  // Crear un producto/insumo recién creado y asignarlo a la línea que lo pidió
  const handleItemCreated = (item) => {
    if (!quickCreate) return;
    const { lineKey: lk, kind } = quickCreate;
    if (kind === 'product') setProducts(prev => [...prev, item]);
    else setIngredients(prev => [...prev, item]);
    // setLineRef lee de la lista; como setState es async, asignamos directo aquí
    const description = kind === 'product' ? item.name : `${item.name} (${item.unit})`;
    const lastCost = kind === 'product' ? item.cost_price : item.last_price;
    setLines(prev => prev.map(l => {
      if (l.key !== lk) return l;
      const patch = { refId: String(item.id), description };
      if ((l.unitCost === '' || l.unitCost == null) && lastCost) patch.unitCost = String(lastCost);
      return { ...l, ...patch };
    }));
    setQuickCreate(null);
  };

  const addLine = () => setLines(prev => [...prev, emptyLine(lineKey.current++)]);
  const removeLine = (key) => setLines(prev => (prev.length === 1 ? prev : prev.filter(l => l.key !== key)));

  const { net, tax, total } = useMemo(() => {
    const net = lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitCost) || 0), 0);
    const tax = documentType === 'factura' ? Math.round(net * IVA_RATE) : 0;
    return { net: Math.round(net), tax, total: Math.round(net) + tax };
  }, [lines, documentType]);

  const resetForm = () => {
    lineKey.current = 1;
    setLines([emptyLine(0)]);
    setDescription('');
  };

  const handleSubmit = async () => {
    if (!categoryId) { toast.error('Selecciona una categoría'); return; }
    const items = [];
    for (const l of lines) {
      const qty = parseFloat(l.quantity);
      const cost = parseFloat(l.unitCost);
      if (!qty && !cost && !l.description.trim() && !l.refId) continue; // línea vacía → ignorar
      if (!(qty > 0)) { toast.error('Hay una línea con cantidad inválida'); return; }
      if (!(cost >= 0)) { toast.error('Hay una línea con costo inválido'); return; }
      if ((l.kind === 'product' || l.kind === 'ingredient') && !l.refId) {
        toast.error('Selecciona el ítem en cada línea de producto/insumo'); return;
      }
      if (l.kind === 'other' && !l.description.trim()) { toast.error('Describe las líneas de tipo "Otro"'); return; }
      items.push({
        product_id: l.kind === 'product' ? parseInt(l.refId) : null,
        ingredient_id: l.kind === 'ingredient' ? parseInt(l.refId) : null,
        description: l.description.trim(),
        quantity: qty,
        unit_cost: cost,
      });
    }
    if (items.length === 0) { toast.error('Agrega al menos una línea'); return; }

    setSubmitting(true);
    try {
      await api.post('/purchases', {
        category_id: parseInt(categoryId),
        supplier_id: supplierId ? parseInt(supplierId) : null,
        document_type: documentType,
        payment_method: paymentMethod,
        description: description.trim() || null,
        items,
      });
      toast.success('Compra registrada · stock y costos actualizados');
      resetForm();
      await loadPurchases();
    } catch (err) {
      toast.error('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><ShoppingBag size={26} style={{ verticalAlign: 'middle', marginRight: 8 }} />Compras</h1>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ margin: '0 0 var(--space-md)', fontSize: '1.05rem', fontWeight: 600 }}>Nueva factura de compra</h3>

        {/* Cabecera */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Proveedor</label>
            <select className="form-select" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">— Sin proveedor —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Categoría de gasto</label>
            <select className="form-select" value={categoryId} onChange={e => setCategoryId(e.target.value)} required>
              <option value="">Selecciona...</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Documento</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {[['factura', 'Factura', FileText], ['boleta', 'Boleta', Receipt]].map(([val, lbl, Icon]) => (
                <button key={val} type="button" onClick={() => setDocumentType(val)}
                  className={`btn btn-sm ${documentType === val ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ gap: 4 }}>
                  <Icon size={14} /> {lbl}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Cómo se pagó</label>
            <select className="form-select" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
              {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>

        {/* Editor de líneas */}
        <div className="compra-lines-head">
          <span style={{ width: 110 }}>Tipo</span>
          <span style={{ flex: 1, minWidth: 180 }}>Ítem / descripción</span>
          <span style={{ width: 90 }}>Cantidad</span>
          <span style={{ width: 120 }}>Costo unit. neto</span>
          <span style={{ width: 96, textAlign: 'right' }}>Subtotal</span>
          <span style={{ width: 32 }} />
        </div>
        <div style={{ marginBottom: 'var(--space-sm)' }}>
          {lines.map(l => {
            const subtotal = (parseFloat(l.quantity) || 0) * (parseFloat(l.unitCost) || 0);
            return (
              <div key={l.key} className="compra-line">
                <div style={{ width: 110 }}>
                  <select className="form-select form-select-sm" value={l.kind} onChange={e => setLineKind(l.key, e.target.value)}>
                    {KIND_OPTIONS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  {l.kind === 'other' ? (
                    <input className="form-input form-input-sm" value={l.description}
                      onChange={e => updateLine(l.key, { description: e.target.value })}
                      placeholder="Ej: Despacho, servicio..." />
                  ) : (
                    <ItemPicker
                      kind={l.kind}
                      items={l.kind === 'product' ? products : ingredients}
                      value={l.refId}
                      onSelect={(id) => setLineRef(l.key, l.kind, id)}
                      onCreate={(name) => setQuickCreate({ lineKey: l.key, kind: l.kind, name })}
                    />
                  )}
                </div>
                <div style={{ width: 90 }}>
                  <input type="number" min="0" step="any" className="form-input form-input-sm" value={l.quantity}
                    onChange={e => updateLine(l.key, { quantity: e.target.value })} placeholder="0" />
                </div>
                <div style={{ width: 120 }}>
                  <input type="number" min="0" step="any" className="form-input form-input-sm" value={l.unitCost}
                    onChange={e => updateLine(l.key, { unitCost: e.target.value })} placeholder="0" />
                </div>
                <div style={{ width: 96, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', alignSelf: 'center' }}>
                  {formatCurrency(Math.round(subtotal))}
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLine(l.key)}
                  disabled={lines.length === 1} style={{ color: 'var(--color-danger)', width: 32, flexShrink: 0 }} title="Quitar línea">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>

        <button type="button" className="btn btn-secondary btn-sm" onClick={addLine} style={{ marginBottom: 'var(--space-md)' }}>
          <Plus size={14} /> Agregar línea
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 220 }}>
            <label className="form-label">Descripción / N° factura <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>(opcional)</span></label>
            <input className="form-input" value={description} maxLength={200}
              onChange={e => setDescription(e.target.value)} placeholder="Ej: Factura 12345 — pedido semanal" />
          </div>
          <div style={{ textAlign: 'right', minWidth: 180 }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Neto: {formatCurrency(net)}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              IVA {documentType === 'factura' ? '(19%)' : '(exento)'}: {formatCurrency(tax)}
            </div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>Total: {formatCurrency(total)}</div>
          </div>
        </div>

        <button className={`btn btn-primary ${submitting ? 'btn-loading' : ''}`} onClick={handleSubmit}
          disabled={submitting} style={{ marginTop: 'var(--space-md)' }}>
          <ShoppingBag size={16} /> {submitting ? 'Registrando...' : 'Registrar compra y reponer stock'}
        </button>
      </div>

      {/* Compras recientes */}
      <h3 style={{ margin: '0 0 var(--space-sm)', fontSize: '1rem', fontWeight: 600 }}>Compras recientes</h3>
      {purchases.length === 0 ? (
        <div className="card empty-state">
          <ShoppingBag size={32} />
          <p>Aún no hay compras registradas</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {purchases.map(p => {
            const open = expandedId === p.id;
            return (
              <div key={p.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <button type="button" onClick={() => setExpandedId(open ? null : p.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', width: '100%', padding: 'var(--space-md)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span className={`badge ${p.document_type === 'factura' ? 'badge-success' : 'badge-info'}`} style={{ fontSize: '0.7rem' }}>
                        {p.document_type === 'factura' ? '🧾 Factura' : 'Boleta'}
                      </span>
                      {p.supplier_name && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                          <Truck size={13} /> {p.supplier_name}
                        </span>
                      )}
                      <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>{p.category_name}</span>
                      {p.payment_method && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>{p.payment_method}</span>
                      )}
                    </div>
                    <div style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                      {formatDate(p.created_at)} · {p.items.length} {p.items.length === 1 ? 'línea' : 'líneas'} · {p.seller_name}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--color-danger)', whiteSpace: 'nowrap' }}>{formatCurrency(p.total_amount)}</div>
                  {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                {open && (
                  <div style={{ borderTop: '1px solid var(--color-border)', padding: 'var(--space-md)' }}>
                    <table className="compras-lines">
                      <thead>
                        <tr><th>Ítem</th><th style={{ width: 90, textAlign: 'right' }}>Cant.</th><th style={{ width: 120, textAlign: 'right' }}>Costo unit.</th><th style={{ width: 120, textAlign: 'right' }}>Subtotal</th></tr>
                      </thead>
                      <tbody>
                        {p.items.map(it => (
                          <tr key={it.id}>
                            <td>
                              {it.product_id ? <Package size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                : it.ingredient_id ? <Wheat size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                : <Tag size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
                              {it.description}
                            </td>
                            <td style={{ textAlign: 'right' }}>{it.quantity}</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(it.unit_cost)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(it.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ marginTop: 'var(--space-sm)', textAlign: 'right', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                      Neto {formatCurrency(p.net_amount)} · IVA {formatCurrency(p.tax_amount)} · <strong style={{ color: 'var(--color-text)' }}>Total {formatCurrency(p.total_amount)}</strong>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {quickCreate && (
        <QuickCreateItemModal
          kind={quickCreate.kind}
          initialName={quickCreate.name}
          defaultCost={lines.find(l => l.key === quickCreate.lineKey)?.unitCost}
          onCreated={handleItemCreated}
          onClose={() => setQuickCreate(null)}
        />
      )}
    </div>
  );
}
