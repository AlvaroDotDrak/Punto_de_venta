/**
 * Compras — Registro de facturas de proveedor con detalle (Fase 2).
 * Cada línea puede reponer un producto, un insumo, o ser solo gasto.
 * El total se guarda como gasto (contabilidad/IVA); las líneas reponen stock y costo.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import { ShoppingBag, Plus, Trash2, Truck, FileText, Receipt, ChevronDown, ChevronUp, Package, Wheat, Tag, ScanLine, AlertTriangle, X, BookOpen } from 'lucide-react';
import ItemPicker from '../components/Compras/ItemPicker';
import QuickCreateItemModal from '../components/Compras/QuickCreateItemModal';
import ScanInvoiceModal from '../components/Compras/ScanInvoiceModal';
import AliasManagerModal from '../components/Compras/AliasManagerModal';

const IVA_RATE = 0.19;
// Mismo vocabulario que el backend (schemas.PaymentMethod) y que Gastos/Caja.
const PAYMENT_METHODS = [
  { value: 'efectivo', label: '💵 Efectivo' },
  { value: 'transferencia', label: '🏦 Transferencia' },
  { value: 'debito', label: '💳 Débito' },
  { value: 'tarjeta', label: '💳 Tarjeta' },
];
const KIND_OPTIONS = [
  { value: 'product', label: 'Producto', icon: Package },
  { value: 'ingredient', label: 'Insumo', icon: Wheat },
  { value: 'other', label: 'Otro', icon: Tag },
];

const emptyLine = (key) => ({ key, kind: 'product', refId: '', description: '', quantity: '', unitCost: '', categoryId: '', unitsPerPack: '1', taxable: true });

export default function Compras() {
  const toast = useToast();
  const lineKey = useRef(1);

  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [ingredients, setIngredients] = useState([]);

  const [supplierId, setSupplierId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [documentType, setDocumentType] = useState('factura');
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState([emptyLine(0)]);
  const [submitting, setSubmitting] = useState(false);

  const [purchases, setPurchases] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  // Creación rápida de producto/insumo desde una línea: { lineKey, kind, name }
  const [quickCreate, setQuickCreate] = useState(null);

  // Escaneo con IA: modal abierto y datos del documento cargado (para el banner)
  const [showScan, setShowScan] = useState(false);
  const [showAliases, setShowAliases] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [scanInfo, setScanInfo] = useState(null);

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

  const handleDeletePurchase = async (p) => {
    setDeletingId(p.id);
    try {
      const res = await api.delete(`/purchases/${p.id}`);
      setConfirmDelete(null);
      setExpandedId(null);
      // loadRefs además de loadPurchases: el stock y los costos cambiaron.
      await Promise.all([loadPurchases(), loadRefs()]);
      toast.success('Compra anulada · stock y costos revertidos');
      (res?.avisos || []).forEach(a => toast.error(a));
    } catch (err) {
      console.error('Anular compra:', err);
      toast.error('Error al anular: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  // Red de seguridad contra el error de pack (y contra los typos): si el costo por
  // unidad se dispara o se desploma contra lo que veníamos pagando, casi siempre es
  // que el pack quedó mal o sobra/falta un dígito.
  const alertaCosto = (l, costoPorUnidad) => {
    if (!l.refId || !(costoPorUnidad > 0)) return null;
    const item = l.kind === 'product'
      ? products.find(p => String(p.id) === String(l.refId))
      : ingredients.find(i => String(i.id) === String(l.refId));
    const referencia = l.kind === 'product' ? item?.cost_price : item?.last_price;
    if (!referencia || referencia <= 0) return null;

    const razon = costoPorUnidad / referencia;
    if (razon >= 3) return `Costo ${razon.toFixed(1)}x mayor al habitual (${formatCurrency(Math.round(referencia))}). ¿Falta indicar el pack?`;
    if (razon <= 1 / 3) return `Costo ${(1 / razon).toFixed(1)}x menor al habitual (${formatCurrency(Math.round(referencia))}). ¿El pack está de más?`;
    return null;
  };

  const updateLine = (key, patch) =>
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));

  const setLineKind = (key, kind) =>
    updateLine(key, { kind, refId: '', description: '', unitsPerPack: '1' });

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
      // Pre-llenar el costo con el último conocido solo si la línea aún no tiene costo.
      // lastCost viene por unidad y el campo es por unidad facturada → escalar al pack.
      if ((l.unitCost === '' || l.unitCost == null) && lastCost) {
        patch.unitCost = String(Math.round(lastCost * (parseFloat(l.unitsPerPack) || 1) * 100) / 100);
      }
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
    // Un producto/insumo siempre es afecto; el flag solo cuenta en líneas "Otro" (IABA).
    const esAfecto = (l) => l.kind !== 'other' || l.taxable !== false;
    const monto = (l) => (parseFloat(l.quantity) || 0) * (parseFloat(l.unitCost) || 0);
    const rawAfecto = lines.reduce((s, l) => s + (esAfecto(l) ? monto(l) : 0), 0);
    const rawNoAfecto = lines.reduce((s, l) => s + (esAfecto(l) ? 0 : monto(l)), 0);
    // Factura con precios que ya traen IVA: el afecto es bruto, derivamos el neto.
    if (documentType === 'factura' && pricesIncludeTax) {
      const nNet = Math.round(rawAfecto / (1 + IVA_RATE));
      return { net: nNet, tax: Math.round(rawAfecto) - nNet, total: Math.round(rawAfecto + rawNoAfecto) };
    }
    const nNet = Math.round(rawAfecto);
    const tax = documentType === 'factura' ? Math.round(nNet * IVA_RATE) : 0;
    return { net: nNet, tax, total: nNet + tax + Math.round(rawNoAfecto) };
  }, [lines, documentType, pricesIncludeTax]);

  const resetForm = () => {
    lineKey.current = 1;
    setLines([emptyLine(0)]);
    setDescription('');
    setInvoiceNumber('');
    setScanInfo(null);
  };

  // Carga al formulario un documento escaneado. Nada se guarda hasta que el admin
  // revisa y presiona "Registrar compra".
  const applyScan = (doc) => {
    const newLines = [];
    let key = 0;
    for (const l of doc.lineas) {
      const qty = l.cantidad || 1;
      // El costo unitario se deriva del total de línea: así el formulario respeta
      // los descuentos por línea que la factura ya aplicó.
      const unit = l.total_linea != null && qty ? l.total_linea / qty : l.precio_unitario;
      // Solo los matches seguros se asignan solos: una sugerencia mal aceptada
      // repondría stock y costo del producto equivocado sin que nadie lo note.
      // La sugerencia deja el tipo listo y el ItemPicker vacío para que el admin elija.
      const seguro = l.match.status === 'seguro' && l.match.id;
      const sugerido = l.match.status === 'sugerencia';
      // El pack confirmado antes por el admin manda; si no hay, se usa el deducido
      // del texto ("...X6"), que queda marcado para que lo confirme.
      const porAlias = l.match.origen === 'alias';
      const packSugerido = !porAlias && l.pack_sugerido ? l.pack_sugerido : null;
      newLines.push({
        key: key++,
        kind: seguro || sugerido ? l.match.tipo : 'other',
        refId: seguro ? String(l.match.id) : '',
        description: seguro ? l.match.name : l.descripcion,
        quantity: String(qty),
        unitCost: unit != null ? String(Math.round(unit * 100) / 100) : '',
        categoryId: '',
        unitsPerPack: porAlias ? String(l.match.units_per_pack || 1) : String(packSugerido || 1),
        packSugerido: !!packSugerido,
        scanOrigin: {
          status: seguro ? 'seguro' : sugerido ? 'sugerencia' : 'sin_match',
          text: l.descripcion,
          suggestion: sugerido ? l.match.name : null,
          porAlias,
        },
      });
    }
    // Si los totales de línea ya traen IVA, los cargos vienen incluidos en ellos:
    // agregarlos otra vez duplicaría el monto.
    const chargesIncluded = doc.prices_include_tax === true;
    if (!chargesIncluded) {
      for (const c of doc.cargos_extra) {
        // Los impuestos adicionales (IABA) entran destildados: suman al total sin IVA.
        const afecto = c.afecto_iva !== false;
        newLines.push({
          key: key++, kind: 'other', refId: '', description: c.concepto,
          quantity: '1', unitCost: c.monto != null ? String(c.monto) : '', categoryId: '', unitsPerPack: '1',
          taxable: afecto,
          scanOrigin: { status: 'cargo', text: `${afecto ? 'Cargo' : 'Impuesto adicional (sin IVA)'} de la factura: ${c.concepto}` },
        });
      }
    }

    lineKey.current = key;
    setLines(newLines.length > 0 ? newLines : [emptyLine(0)]);
    if (doc.supplier_id) setSupplierId(String(doc.supplier_id));
    if (doc.tipo_documento === 'factura' || doc.tipo_documento === 'boleta') setDocumentType(doc.tipo_documento);
    setPricesIncludeTax(doc.prices_include_tax === true);
    setInvoiceNumber(doc.folio ? String(doc.folio).slice(0, 40) : '');
    setDescription([doc.folio && `Factura ${doc.folio}`, doc.proveedor, doc.fecha].filter(Boolean).join(' — ').slice(0, 200));
    setScanInfo({
      proveedor: doc.proveedor,
      rut: doc.rut_proveedor,
      supplierMatched: !!doc.supplier_id,
      neto: doc.neto,
      iva: doc.iva,
      total: doc.total,
      avisos: doc.avisos,
      observaciones: doc.observaciones,
      chargesIncluded: chargesIncluded && doc.cargos_extra.length > 0,
    });
    setShowScan(false);
    toast.success('Datos cargados · revisa antes de guardar');
  };

  const createSupplierFromScan = async () => {
    try {
      const created = await api.post('/suppliers', {
        name: scanInfo.proveedor,
        rut: scanInfo.rut || null,
      });
      setSuppliers(prev => [...prev, created]);
      setSupplierId(String(created.id));
      setScanInfo(prev => ({ ...prev, supplierMatched: true }));
      toast.success('Proveedor creado');
    } catch (err) {
      toast.error('Error al crear proveedor: ' + err.message);
    }
  };

  const handleSubmit = async () => {
    if (!categoryId) { toast.error('Selecciona una categoría'); return; }
    const items = [];
    for (const l of lines) {
      const qty = parseFloat(l.quantity);
      const cost = parseFloat(l.unitCost);
      if (!qty && !cost && !l.description.trim() && !l.refId) continue; // línea vacía → ignorar
      if (!(qty > 0)) { toast.error('Hay una línea con cantidad inválida'); return; }
      if (!Number.isFinite(cost)) { toast.error('Hay una línea con costo inválido'); return; }
      // El costo negativo (descuento, nota de crédito) solo se permite en líneas "Otro".
      if (cost < 0 && l.kind !== 'other') { toast.error('El costo negativo solo se permite en líneas "Otro" (descuentos)'); return; }
      if ((l.kind === 'product' || l.kind === 'ingredient') && !l.refId) {
        toast.error('Selecciona el ítem en cada línea de producto/insumo'); return;
      }
      if (l.kind === 'other' && !l.description.trim()) { toast.error('Describe las líneas de tipo "Otro"'); return; }
      const pack = l.kind === 'other' ? 1 : (parseFloat(l.unitsPerPack) || 1);
      if (!(pack > 0)) { toast.error('Hay una línea con unidades por pack inválidas'); return; }
      items.push({
        product_id: l.kind === 'product' ? parseInt(l.refId) : null,
        ingredient_id: l.kind === 'ingredient' ? parseInt(l.refId) : null,
        category_id: l.categoryId ? parseInt(l.categoryId) : null,
        description: l.description.trim(),
        quantity: qty,
        unit_cost: cost,
        units_per_pack: pack,
        taxable: l.kind === 'other' ? l.taxable !== false : true,
      });
    }
    if (items.length === 0) { toast.error('Agrega al menos una línea'); return; }

    const payload = {
      category_id: parseInt(categoryId),
      supplier_id: supplierId ? parseInt(supplierId) : null,
      invoice_number: invoiceNumber.trim() || null,
      document_type: documentType,
      payment_method: paymentMethod,
      prices_include_tax: documentType === 'factura' && pricesIncludeTax,
      description: description.trim() || null,
      items,
    };

    setSubmitting(true);
    try {
      try {
        await api.post('/purchases', payload);
      } catch (err) {
        // El folio ya existe: no bloqueamos (puede ser una nota de crédito o un
        // folio repetido de verdad), pero exigimos confirmarlo a ojo abierto.
        if (err.status === 409 && err.data?.detail?.code === 'duplicate_invoice') {
          if (!window.confirm(`${err.data.detail.message}\n\n¿Cargarla de nuevo igual? El stock y los costos se sumarán otra vez.`)) {
            setSubmitting(false);
            return;
          }
          await api.post('/purchases', { ...payload, force: true });
        } else {
          throw err;
        }
      }
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Nueva factura de compra</h3>
          <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAliases(true)}
              title="Ver y borrar las equivalencias que aprendió el escaneo">
              <BookOpen size={14} /> Equivalencias
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowScan(true)}>
              <ScanLine size={14} /> Escanear factura
            </button>
          </div>
        </div>

        {scanInfo && (
          <div style={{ border: '1px solid var(--color-border)', borderLeft: '3px solid var(--color-primary)', borderRadius: 'var(--radius-sm, 6px)', padding: 'var(--space-md)', marginBottom: 'var(--space-md)', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-md)' }}>
              <div>
                <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <ScanLine size={14} /> Datos leídos de la factura
                </strong>
                <div style={{ marginTop: 4, color: 'var(--color-text-secondary)' }}>
                  El papel dice: Neto {scanInfo.neto != null ? formatCurrency(scanInfo.neto) : '—'} ·
                  IVA {scanInfo.iva != null ? formatCurrency(scanInfo.iva) : '—'} ·
                  <strong style={{ color: 'var(--color-text)' }}> Total {scanInfo.total != null ? formatCurrency(scanInfo.total) : '—'}</strong>
                  {scanInfo.total != null && Math.abs(scanInfo.total - total) > 2 && (
                    <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}> · no calza con el total calculado ({formatCurrency(total)})</span>
                  )}
                </div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setScanInfo(null)} title="Ocultar">
                <X size={14} />
              </button>
            </div>

            {!scanInfo.supplierMatched && scanInfo.proveedor && (
              <div style={{ marginTop: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>Proveedor <strong>{scanInfo.proveedor}</strong>{scanInfo.rut ? ` (${scanInfo.rut})` : ''} no está en tu lista.</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={createSupplierFromScan}>
                  <Plus size={13} /> Crear proveedor
                </button>
              </div>
            )}
            {!scanInfo.supplierMatched && !scanInfo.proveedor && (
              <div style={{ marginTop: 'var(--space-sm)', color: 'var(--color-text-secondary)' }}>
                No se pudo leer el nombre del proveedor{scanInfo.rut ? ` (RUT ${scanInfo.rut})` : ''} — selecciónalo arriba.
              </div>
            )}
            {scanInfo.chargesIncluded && (
              <div style={{ marginTop: 6, color: 'var(--color-text-secondary)' }}>
                Los cargos extra (fletes, impuestos) ya venían incluidos en los totales de línea.
              </div>
            )}
            {scanInfo.avisos.map((a, i) => (
              <div key={i} style={{ marginTop: 6, display: 'flex', gap: 6, color: 'var(--color-warning, #B45309)' }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> <span>{a}</span>
              </div>
            ))}
            {scanInfo.observaciones && (
              <div style={{ marginTop: 6, color: 'var(--color-text-secondary)' }}>{scanInfo.observaciones}</div>
            )}
          </div>
        )}

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
            <label className="form-label">Categoría por defecto</label>
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
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">N° de factura / folio</label>
            <input className="form-input" value={invoiceNumber} maxLength={40}
              onChange={e => setInvoiceNumber(e.target.value)}
              placeholder="Ej: 104209861"
              title="Se usa para avisarte si esta factura ya fue cargada antes" />
          </div>
        </div>

        {documentType === 'factura' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-md)', fontSize: '0.9rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={pricesIncludeTax} onChange={e => setPricesIncludeTax(e.target.checked)} />
            <span>Los costos que ingreso <strong>ya incluyen IVA</strong> (se descuenta el 19% para obtener el neto, en vez de sumarlo)</span>
          </label>
        )}

        {/* Editor de líneas */}
        <div className="compra-lines-head">
          <span style={{ width: 110 }}>Tipo</span>
          <span style={{ flex: 1, minWidth: 180 }}>Ítem / descripción</span>
          <span style={{ width: 150 }}>Categoría</span>
          <span style={{ width: 90 }}>Cantidad</span>
          <span style={{ width: 80 }} title="Unidades de inventario que trae cada unidad facturada">Un. x pack</span>
          <span style={{ width: 120 }}>Costo unit. neto</span>
          <span style={{ width: 96, textAlign: 'right' }}>Subtotal</span>
          <span style={{ width: 32 }} />
        </div>
        <div style={{ marginBottom: 'var(--space-sm)' }}>
          {lines.map(l => {
            const qtyNum = parseFloat(l.quantity) || 0;
            const pack = l.kind === 'other' ? 1 : (parseFloat(l.unitsPerPack) || 1);
            // El subtotal se calcula sobre lo FACTURADO (packs), que es lo que cuadra
            // contra el papel; el pack solo afecta stock y costo por unidad.
            const subtotal = qtyNum * (parseFloat(l.unitCost) || 0);
            // stock=null → el producto no lleva inventario: la compra actualiza su
            // costo pero no su stock (ver create_purchase).
            const sinInventario = l.kind === 'product' && l.refId &&
              products.find(p => String(p.id) === String(l.refId))?.stock == null;
            const costoPorUnidad = (parseFloat(l.unitCost) || 0) / pack;
            const alerta = alertaCosto(l, costoPorUnidad);
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
                  {l.scanOrigin && (
                    <div style={{
                      fontSize: '0.7rem', marginTop: 3, lineHeight: 1.3,
                      color: l.scanOrigin.status === 'sugerencia' ? 'var(--color-warning, #B45309)'
                        : l.scanOrigin.status === 'sin_match' ? 'var(--color-danger)'
                        : 'var(--color-text-secondary)',
                    }} title="Texto original de la factura escaneada">
                      {l.scanOrigin.status === 'sugerencia' && `⚠ ¿${l.scanOrigin.suggestion}? · `}
                      {l.scanOrigin.status === 'sin_match' && '✎ '}
                      {l.scanOrigin.porAlias && '✓ '}
                      {l.scanOrigin.text}
                    </div>
                  )}
                  {sinInventario && (
                    <div style={{ fontSize: '0.7rem', marginTop: 3, lineHeight: 1.3, color: 'var(--color-warning, #B45309)' }}>
                      Este producto no lleva inventario: se actualizará su costo, pero no su stock.
                      Para empezar a contarlo, dale un stock inicial en Productos.
                    </div>
                  )}
                </div>
                <div style={{ width: 150 }}>
                  <select className="form-select form-select-sm" value={l.categoryId}
                    onChange={e => updateLine(l.key, { categoryId: e.target.value })}
                    title="Categoría de gasto de esta línea">
                    <option value="">Igual a la factura</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div style={{ width: 90 }}>
                  <input type="number" min="0" step="any" className="form-input form-input-sm" value={l.quantity}
                    onChange={e => updateLine(l.key, { quantity: e.target.value })} placeholder="0" />
                </div>
                <div style={{ width: 80 }}>
                  {l.kind === 'other' ? (
                    documentType === 'factura' ? (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                        title="Destilda si es un impuesto adicional (IABA, ILA): suma al total sin llevar IVA">
                        <input type="checkbox" checked={l.taxable !== false}
                          onChange={e => updateLine(l.key, { taxable: e.target.checked })} />
                        afecto IVA
                      </label>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>—</span>
                    )
                  ) : (
                    <>
                      <input type="number" min="0" step="any" className="form-input form-input-sm" value={l.unitsPerPack}
                        onChange={e => updateLine(l.key, { unitsPerPack: e.target.value, packSugerido: false })}
                        placeholder="1" title="Si la factura vende packs, cuántas unidades trae cada uno"
                        style={l.packSugerido ? { borderColor: 'var(--color-warning, #B45309)', background: 'rgba(180,83,9,0.06)' } : undefined} />
                      {/* Siempre visible: es el número que realmente entra al stock. */}
                      <div style={{ fontSize: '0.7rem', marginTop: 3, color: l.packSugerido ? 'var(--color-warning, #B45309)' : 'var(--color-text-secondary)' }}>
                        {sinInventario
                          ? 'no lleva inventario'
                          : l.packSugerido ? `¿repone ${qtyNum * pack}?` : `repone ${qtyNum * pack}`}
                      </div>
                    </>
                  )}
                </div>
                <div style={{ width: 120 }}>
                  {/* Las líneas "Otro" admiten monto negativo (descuentos, notas de crédito). */}
                  <input type="number" min={l.kind === 'other' ? undefined : '0'} step="any"
                    className="form-input form-input-sm" value={l.unitCost}
                    onChange={e => updateLine(l.key, { unitCost: e.target.value })}
                    placeholder={l.kind === 'other' ? '0 (− para descuento)' : '0'}
                    style={alerta ? { borderColor: 'var(--color-danger)' } : undefined} />
                  {pack > 1 && costoPorUnidad > 0 && (
                    <div style={{ fontSize: '0.7rem', marginTop: 3, color: 'var(--color-text-secondary)' }}>
                      {formatCurrency(Math.round(costoPorUnidad))} c/u
                    </div>
                  )}
                  {alerta && (
                    <div style={{ fontSize: '0.7rem', marginTop: 3, color: 'var(--color-danger)', lineHeight: 1.3 }}>
                      ⚠ {alerta}
                    </div>
                  )}
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
                      {p.invoice_number && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }} title="N° de factura del proveedor">
                          N° {p.invoice_number}
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
                        <tr><th>Ítem</th><th style={{ width: 160 }}>Categoría</th><th style={{ width: 90, textAlign: 'right' }}>Cant.</th><th style={{ width: 120, textAlign: 'right' }}>Costo unit.</th><th style={{ width: 120, textAlign: 'right' }}>Subtotal</th></tr>
                      </thead>
                      <tbody>
                        {p.items.map(it => (
                          <tr key={it.id}>
                            <td>
                              {it.product_id ? <Package size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                : it.ingredient_id ? <Wheat size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                : <Tag size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
                              {it.description}
                              {it.taxable === false && (
                                <span className="badge badge-warning" style={{ fontSize: '0.62rem', marginLeft: 6 }}
                                  title="Impuesto adicional: suma al total sin llevar IVA">sin IVA</span>
                              )}
                            </td>
                            <td>
                              <span className={`badge ${it.category_name !== p.category_name ? 'badge-warning' : 'badge-info'}`} style={{ fontSize: '0.68rem' }}>
                                {it.category_name}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {it.units_per_pack > 1 ? (
                                <span title="Cantidad facturada × unidades por pack = unidades que entraron al stock">
                                  {it.quantity} × {it.units_per_pack}
                                  <strong style={{ marginLeft: 4 }}>= {it.quantity * it.units_per_pack}</strong>
                                </span>
                              ) : it.quantity}
                            </td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(it.unit_cost)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(it.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ marginTop: 'var(--space-sm)', textAlign: 'right', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                      Neto {formatCurrency(p.net_amount)} · IVA {formatCurrency(p.tax_amount)} · <strong style={{ color: 'var(--color-text)' }}>Total {formatCurrency(p.total_amount)}</strong>
                    </div>

                    <div style={{ marginTop: 'var(--space-md)', paddingTop: 'var(--space-sm)', borderTop: '1px solid var(--color-border)' }}>
                      {confirmDelete === p.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                          <span style={{ flex: 1, minWidth: 240, fontSize: '0.82rem', color: 'var(--color-danger)' }}>
                            Se devolverá el stock y los costos al estado anterior, y la factura se borra
                            del registro. Las equivalencias aprendidas se mantienen.
                          </span>
                          <button type="button" className="btn btn-danger btn-sm" disabled={deletingId === p.id}
                            onClick={() => handleDeletePurchase(p)}>
                            {deletingId === p.id ? 'Anulando...' : 'Sí, anular'}
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(p.id)}
                          style={{ color: 'var(--color-danger)' }}>
                          <Trash2 size={14} /> Anular compra
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showScan && (
        <ScanInvoiceModal onApply={applyScan} onClose={() => setShowScan(false)} />
      )}

      {showAliases && (
        <AliasManagerModal suppliers={suppliers} onClose={() => setShowAliases(false)} />
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
