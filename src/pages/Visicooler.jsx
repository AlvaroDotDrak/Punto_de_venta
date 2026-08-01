/**
 * Visicooler — Control visual de stock de bebidas
 * Semáforo configurable por producto (min_stock_cooler)
 */
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '../context/ToastContext';
import { useSeller } from '../context/SellerContext';
import { useConfig } from '../context/ConfigContext';
import api from '../utils/api';
import { formatCurrency } from '../utils/formatters';
import {
  Thermometer, Plus, Minus, AlertTriangle, CheckCircle2,
  XCircle, Search, X, Settings, Package, PackagePlus,
} from 'lucide-react';

// Thresholds: si min_stock_cooler no está definido, usar 3 como fallback
const DEFAULT_MIN = 3;

function getStatus(stock, min) {
  const threshold = min ?? DEFAULT_MIN;
  if (stock === null || stock === undefined) return 'none';
  if (stock === 0)              return 'empty';
  if (stock <= threshold)       return 'low';
  return 'ok';
}

const STATUS_META = {
  ok:      { label: 'En stock',    color: '#2E8B57', bg: 'rgba(46,139,87,0.07)',   border: 'rgba(46,139,87,0.25)',  Icon: CheckCircle2 },
  low:     { label: 'Stock bajo',  color: '#C8820A', bg: 'rgba(200,130,10,0.07)',  border: 'rgba(200,130,10,0.3)',  Icon: AlertTriangle },
  empty:   { label: 'Sin stock',   color: '#C0392B', bg: 'rgba(192,57,43,0.07)',   border: 'rgba(192,57,43,0.35)', Icon: XCircle },
  none:    { label: 'Sin tracking',color: '#8899AA', bg: 'rgba(136,153,170,0.07)', border: 'rgba(136,153,170,0.2)', Icon: Package },
};

export default function Visicooler() {
  const toast = useToast();
  const { currentSeller, isAdmin } = useSeller();
  const { categories, t } = useConfig();
  const canEdit = isAdmin || currentSeller?.products_access === 'full';

  const [products, setProducts] = useState([]);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState('all'); // 'all' | 'ok' | 'low' | 'empty'
  const [catFilter, setCatFilter] = useState('todas');

  // Modal reposición
  const [restockTarget, setRestockTarget] = useState(null);
  const [restockQty, setRestockQty]       = useState(1);
  const [restockLoading, setRestockLoading] = useState(false);

  // Carga del día: reponer varios productos de una vez (el lote de la mañana)
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkQty, setBulkQty] = useState({});
  const [bulkCat, setBulkCat] = useState('todas');
  const [bulkLoading, setBulkLoading] = useState(false);

  // Modal configurar alerta
  const [alertTarget, setAlertTarget]   = useState(null);
  const [alertMin, setAlertMin]         = useState(DEFAULT_MIN);
  const [alertLoading, setAlertLoading] = useState(false);

  // Las categorías con inventario las define el rubro (flag `stock`). Antes esto
  // era `category === 'bebidas'` hardcodeado, así que en cualquier rubro que no
  // fuera pastelería la página quedaba casi vacía: en la cevichería los ceviches
  // llevan stock y no se veían.
  const stockCats = useMemo(
    () => new Set(categories.filter(c => c.stock).map(c => c.value)),
    [categories]
  );

  const loadProducts = async () => {
    const all = await api.get('/products?active_only=true');
    setProducts(all.filter(p => stockCats.size === 0 || stockCats.has(p.category)));
  };

  useEffect(() => { loadProducts(); }, [stockCats]);

  const enriched = useMemo(() =>
    products.map(p => ({
      ...p,
      status: getStatus(p.stock, p.min_stock_cooler),
      pct: p.stock != null && (p.min_stock_cooler ?? DEFAULT_MIN) > 0
        ? Math.min(100, (p.stock / Math.max(p.stock, (p.min_stock_cooler ?? DEFAULT_MIN) * 3)) * 100)
        : null,
    })), [products]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (filter !== 'all') list = list.filter(p => p.status === filter);
    if (catFilter !== 'todas') list = list.filter(p => p.category === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    // Orden: sin stock → bajo → ok → sin tracking
    const ord = { empty: 0, low: 1, ok: 2, none: 3 };
    return [...list].sort((a, b) => (ord[a.status] ?? 3) - (ord[b.status] ?? 3));
  }, [enriched, filter, catFilter, search]);

  // Solo las categorías que realmente tienen productos, en el orden del rubro
  const catTabs = useMemo(() => {
    const presentes = new Map();
    enriched.forEach(p => presentes.set(p.category, (presentes.get(p.category) || 0) + 1));
    return categories
      .filter(c => presentes.has(c.value))
      .map(c => ({ value: c.value, label: c.label, emoji: c.emoji, count: presentes.get(c.value) }));
  }, [enriched, categories]);

  // Agrupado por categoría: con 100+ productos una lista plana es ilegible
  const agrupado = useMemo(() => {
    const grupos = new Map();
    filtered.forEach(p => {
      if (!grupos.has(p.category)) grupos.set(p.category, []);
      grupos.get(p.category).push(p);
    });
    const orden = categories.map(c => c.value);
    return [...grupos.entries()]
      .sort((a, b) => orden.indexOf(a[0]) - orden.indexOf(b[0]))
      .map(([value, items]) => ({
        value,
        label: categories.find(c => c.value === value)?.label || value,
        emoji: categories.find(c => c.value === value)?.emoji,
        items,
      }));
  }, [filtered, categories]);

  const counts = useMemo(() => ({
    total: enriched.length,
    ok:    enriched.filter(p => p.status === 'ok').length,
    low:   enriched.filter(p => p.status === 'low').length,
    empty: enriched.filter(p => p.status === 'empty').length,
  }), [enriched]);

  // ── REPOSICIÓN ────────────────────────────────────────
  const openRestock = (product) => {
    setRestockTarget(product);
    setRestockQty(1);
  };

  const handleRestock = async () => {
    if (!restockTarget || restockQty < 1) return;
    setRestockLoading(true);
    try {
      await api.post(`/products/${restockTarget.id}/restock`, { quantity: restockQty });
      toast.success(`+${restockQty} unidades de "${restockTarget.name}"`);
      setRestockTarget(null);
      loadProducts();
    } catch (err) {
      toast.error('Error al reponer: ' + err.message);
    } finally {
      setRestockLoading(false);
    }
  };

  const openBulk = () => {
    setBulkQty({});
    setBulkCat('todas');
    setBulkOpen(true);
  };

  const handleBulk = async () => {
    const items = Object.entries(bulkQty)
      .map(([id, q]) => ({ product_id: parseInt(id), quantity: parseFloat(q) }))
      .filter(it => Number.isFinite(it.quantity) && it.quantity > 0);
    if (items.length === 0) { toast.error('Ingresa al menos una cantidad'); return; }
    setBulkLoading(true);
    try {
      const r = await api.post('/products/restock-bulk', { items });
      toast.success(`${r.actualizados} producto(s) repuestos`);
      r.avisos?.forEach(a => toast.error(a));
      setBulkOpen(false);
      loadProducts();
    } catch (err) {
      toast.error('Error al reponer: ' + err.message);
    } finally {
      setBulkLoading(false);
    }
  };

  // ── CONFIGURAR ALERTA ─────────────────────────────────
  const openAlert = (product) => {
    setAlertTarget(product);
    setAlertMin(product.min_stock_cooler ?? DEFAULT_MIN);
  };

  const handleSaveAlert = async () => {
    if (!alertTarget) return;
    setAlertLoading(true);
    try {
      await api.patch(`/products/${alertTarget.id}`, { min_stock_cooler: alertMin });
      toast.success(`Alerta de "${alertTarget.name}" configurada en ${alertMin} unidades`);
      setAlertTarget(null);
      loadProducts();
    } catch (err) {
      toast.error('Error al guardar: ' + err.message);
    } finally {
      setAlertLoading(false);
    }
  };

  // ── RENDER ────────────────────────────────────────────
  return (
    <div className="theme-visicooler">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">
          <Thermometer size={26} style={{ verticalAlign: 'middle', marginRight: 10 }} />
          {t('cooler', 'Visicooler')}
        </h1>
        {canEdit && (
          <button className="btn btn-primary" onClick={openBulk}>
            <PackagePlus size={16} /> Carga del día
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="vt-stats">
        <div className="vt-stat" style={{ cursor: 'pointer' }} onClick={() => setFilter('all')}>
          <div className="vt-stat-value">{counts.total}</div>
          <div className="vt-stat-label">Total SKUs</div>
        </div>
        <div className="vt-stat" style={{ cursor: 'pointer' }} onClick={() => setFilter('ok')}>
          <div className="vt-stat-value" style={{ color: STATUS_META.ok.color }}>{counts.ok}</div>
          <div className="vt-stat-label">En stock</div>
        </div>
        {counts.low > 0 && (
          <div className="vt-stat vt-stat-warning" style={{ cursor: 'pointer' }} onClick={() => setFilter('low')}>
            <div className="vt-stat-value">{counts.low}</div>
            <div className="vt-stat-label">Stock bajo</div>
          </div>
        )}
        {counts.empty > 0 && (
          <div className="vt-stat vt-stat-danger" style={{ cursor: 'pointer' }} onClick={() => setFilter('empty')}>
            <div className="vt-stat-value">{counts.empty}</div>
            <div className="vt-stat-label">Sin stock</div>
          </div>
        )}
      </div>

      {/* Banner de alerta */}
      {counts.empty > 0 && (
        <div className="vt-alert">
          <XCircle size={16} />
          <strong>{counts.empty} producto{counts.empty > 1 ? 's' : ''} sin stock.</strong>
          {' '}Reponer antes de la próxima venta.
        </div>
      )}

      {/* Toolbar */}
      <div className="vt-toolbar">
        <div className="tabs" style={{ marginBottom: 0 }}>
          {[
            { key: 'all',   label: 'Todos',      count: counts.total },
            { key: 'low',   label: 'Stock bajo',  count: counts.low },
            { key: 'empty', label: 'Sin stock',   count: counts.empty },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              className={`tab ${filter === key ? 'active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
              <span className="vt-tab-count">{count}</span>
            </button>
          ))}
        </div>
        <div className="search-bar" style={{ flex: 1, minWidth: 160, maxWidth: 300, marginBottom: 0 }}>
          <Search className="search-icon" size={15} />
          <input
            type="text"
            placeholder="Buscar producto…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-light)', display: 'flex' }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Filtro por categoría */}
      {catTabs.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
          <button type="button" onClick={() => setCatFilter('todas')}
            className={`btn btn-sm ${catFilter === 'todas' ? 'btn-primary' : 'btn-secondary'}`}>
            Todas <span style={{ opacity: 0.7, marginLeft: 4 }}>{enriched.length}</span>
          </button>
          {catTabs.map(c => (
            <button key={c.value} type="button" onClick={() => setCatFilter(c.value)}
              className={`btn btn-sm ${catFilter === c.value ? 'btn-primary' : 'btn-secondary'}`}>
              {c.emoji ? `${c.emoji} ` : ''}{c.label}
              <span style={{ opacity: 0.7, marginLeft: 4 }}>{c.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-md)' }}>
            <Thermometer size={28} style={{ color: 'var(--color-text-light)' }} />
          </div>
          <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
            {search || filter !== 'all' || catFilter !== 'todas' ? 'Sin resultados' : 'No hay productos con inventario'}
          </h3>
          <p style={{ fontSize: '0.875rem' }}>
            {search || filter !== 'all' || catFilter !== 'todas'
              ? 'Prueba con otro filtro o búsqueda.'
              : 'Los productos llevan inventario según su categoría. Revisa el módulo Productos.'}
          </p>
        </div>
      ) : (
        agrupado.map(grupo => (
        <div key={grupo.value} style={{ marginBottom: 'var(--space-lg)' }}>
          {/* Encabezado de categoría: solo tiene sentido si hay más de una a la vista */}
          {agrupado.length > 1 && (
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 8,
              margin: '0 0 var(--space-sm)', paddingBottom: 4,
              borderBottom: '1px solid var(--color-border)',
            }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>
                {grupo.emoji ? `${grupo.emoji} ` : ''}{grupo.label}
              </h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                {grupo.items.length} producto{grupo.items.length === 1 ? '' : 's'}
              </span>
            </div>
          )}
        <div className="vt-grid">
          {grupo.items.map(product => {
            const meta  = STATUS_META[product.status];
            const SIcon = meta.Icon;
            const min   = product.min_stock_cooler ?? DEFAULT_MIN;

            // Barra visual: llena relativa al triple del umbral (o 1 si min=0)
            const barMax = Math.max(product.stock ?? 0, min * 3, 1);
            const barPct = product.stock != null
              ? Math.min(100, ((product.stock) / barMax) * 100)
              : 0;

            return (
              <div
                key={product.id}
                className="vt-card"
                style={{ borderColor: meta.border, background: meta.bg, '--card-meta-color': meta.color }}
              >
                {/* Barra lateral */}
                <div className="vt-card-accent" style={{ background: meta.color }} />

                {/* Thumbnail */}
                <div className="vt-card-thumb">
                  {product.photo
                    ? <img src={product.photo} alt={product.name} />
                    : <span>🧃</span>}
                </div>

                {/* Contenido */}
                <div className="vt-card-body">
                  <div className="vt-card-top">
                    <div>
                      <div className="vt-card-name">{product.name}</div>
                      <div className="vt-card-sub">{formatCurrency(product.price)}</div>
                    </div>
                    <div
                      className="vt-badge"
                      style={{ background: meta.color + '18', color: meta.color, borderColor: meta.color + '40' }}
                    >
                      <SIcon size={11} />
                      {meta.label}
                    </div>
                  </div>

                  {/* Stock numérico grande */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '6px 0 4px' }}>
                    <span style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1, color: meta.color }}>
                      {product.stock ?? '—'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                      {product.stock != null ? 'unidades' : 'sin tracking'}
                    </span>
                  </div>

                  {/* Barra de stock */}
                  {product.stock != null && (
                    <div className="vt-progress-wrap">
                      <div className="vt-progress-bar">
                        <div
                          className="vt-progress-fill"
                          style={{ width: `${barPct}%`, background: meta.color, transition: 'width 0.4s ease' }}
                        />
                      </div>
                      <div className="vt-progress-labels">
                        <span style={{ color: 'var(--color-text-light)', fontSize: '0.75rem' }}>
                          Alerta: ≤ {min} und.
                        </span>
                        {product.status === 'low' && (
                          <span style={{ color: meta.color, fontSize: '0.75rem', fontWeight: 600 }}>
                            ¡Reponer pronto!
                          </span>
                        )}
                        {product.status === 'empty' && (
                          <span style={{ color: meta.color, fontSize: '0.75rem', fontWeight: 600 }}>
                            ¡Sin stock!
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Acciones */}
                  {isAdmin && (
                    <div className="vt-card-actions">
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.78rem' }}
                        onClick={() => openAlert(product)}
                        title="Configurar umbral de alerta"
                      >
                        <Settings size={12} /> Alerta
                      </button>
                      {product.stock != null && (
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: '0.78rem' }}
                          onClick={() => openRestock(product)}
                          title="Reponer stock"
                        >
                          <Plus size={12} /> Reponer
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </div>
        ))
      )}

      {/* ── MODAL: REPONER STOCK ──────────────────────── */}
      {restockTarget && (
        <div className="modal-overlay" onClick={() => setRestockTarget(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--color-primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Plus size={16} style={{ color: 'var(--color-primary)' }} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1rem' }}>Reponer Stock</h2>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 1 }}>
                    {restockTarget.name} · stock actual: <strong>{restockTarget.stock}</strong>
                  </div>
                </div>
              </div>
              <button className="modal-close" onClick={() => setRestockTarget(null)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Unidades a agregar</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginTop: 4 }}>
                  <button
                    className="btn btn-secondary btn-sm btn-icon"
                    onClick={() => setRestockQty(q => Math.max(1, q - 1))}
                  >
                    <Minus size={14} />
                  </button>
                  <span style={{ minWidth: 48, textAlign: 'center', fontWeight: 800, fontSize: '1.4rem' }}>
                    {restockQty}
                  </span>
                  <button
                    className="btn btn-secondary btn-sm btn-icon"
                    onClick={() => setRestockQty(q => Math.min(500, q + 1))}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <div style={{ marginTop: 'var(--space-sm)', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                  Atajos:
                  {[6, 12, 24, 48].map(n => (
                    <button
                      key={n}
                      onClick={() => setRestockQty(n)}
                      style={{ marginLeft: 6, padding: '2px 10px', border: '1px solid var(--color-border)', borderRadius: 99, background: restockQty === n ? 'var(--color-primary)' : 'transparent', color: restockQty === n ? '#fff' : 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ padding: 'var(--space-sm) var(--space-md)', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                Nuevo total: <strong style={{ color: 'var(--color-text)', fontSize: '1rem' }}>
                  {(restockTarget.stock ?? 0) + restockQty} unidades
                </strong>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setRestockTarget(null)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={handleRestock}
                disabled={restockLoading}
              >
                {restockLoading ? 'Guardando…' : `Agregar ${restockQty} unidad${restockQty > 1 ? 'es' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CARGA DEL DÍA (reposición por lote) ── */}
      {bulkOpen && (
        <div className="modal-overlay" onClick={() => setBulkOpen(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize: '1.05rem' }}>Carga del día</h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  Lo que ingreses se <strong>suma</strong> al stock actual
                </div>
              </div>
              <button className="modal-close" onClick={() => setBulkOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
                {['todas', ...new Set(products.map(p => p.category))].map(c => (
                  <button key={c} type="button" onClick={() => setBulkCat(c)}
                    className={`btn btn-sm ${bulkCat === c ? 'btn-primary' : 'btn-secondary'}`}>
                    {c === 'todas' ? 'Todas' : (categories.find(x => x.value === c)?.label || c)}
                  </button>
                ))}
              </div>
              {products
                .filter(p => bulkCat === 'todas' || p.category === bulkCat)
                .map(p => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
                    padding: '6px 0', borderBottom: '1px solid var(--color-border)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                        quedan {p.stock ?? '—'}
                      </div>
                    </div>
                    <input type="number" min="0" step="any" className="form-input form-input-sm"
                      style={{ width: 90, textAlign: 'center' }} placeholder="0"
                      value={bulkQty[p.id] ?? ''}
                      onChange={e => setBulkQty(q => ({ ...q, [p.id]: e.target.value }))} />
                    {parseFloat(bulkQty[p.id]) > 0 && (
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-success)', minWidth: 54, textAlign: 'right' }}>
                        → {(p.stock ?? 0) + parseFloat(bulkQty[p.id])}
                      </span>
                    )}
                  </div>
                ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setBulkOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleBulk} disabled={bulkLoading} style={{ flex: 1 }}>
                {bulkLoading ? 'Guardando…' : 'Cargar al inventario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CONFIGURAR ALERTA ──────────────────── */}
      {alertTarget && (
        <div className="modal-overlay" onClick={() => setAlertTarget(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--color-warning-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Settings size={16} style={{ color: 'var(--color-warning)' }} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1rem' }}>Configurar Alerta</h2>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 1 }}>
                    {alertTarget.name}
                  </div>
                </div>
              </div>
              <button className="modal-close" onClick={() => setAlertTarget(null)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                Cuando el stock sea igual o menor a este número, la tarjeta cambia a <strong style={{ color: STATUS_META.low.color }}>amarillo</strong>. En <strong style={{ color: STATUS_META.empty.color }}>rojo</strong> cuando llega a cero.
              </p>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Umbral de alerta (unidades)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginTop: 4 }}>
                  <button
                    className="btn btn-secondary btn-sm btn-icon"
                    onClick={() => setAlertMin(v => Math.max(0, v - 1))}
                  >
                    <Minus size={14} />
                  </button>
                  <span style={{ minWidth: 48, textAlign: 'center', fontWeight: 800, fontSize: '1.4rem' }}>
                    {alertMin}
                  </span>
                  <button
                    className="btn btn-secondary btn-sm btn-icon"
                    onClick={() => setAlertMin(v => Math.min(100, v + 1))}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <div style={{ marginTop: 'var(--space-sm)', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                  Atajos:
                  {[2, 3, 5, 10].map(n => (
                    <button
                      key={n}
                      onClick={() => setAlertMin(n)}
                      style={{ marginLeft: 6, padding: '2px 10px', border: '1px solid var(--color-border)', borderRadius: 99, background: alertMin === n ? 'var(--color-warning)' : 'transparent', color: alertMin === n ? '#fff' : 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Previsualización del semáforo */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 4 }}>
                {[
                  { label: 'Verde', desc: `Stock > ${alertMin}`, color: STATUS_META.ok.color, bg: STATUS_META.ok.bg },
                  { label: 'Amarillo', desc: `Stock 1–${alertMin}`, color: STATUS_META.low.color, bg: STATUS_META.low.bg },
                  { label: 'Rojo', desc: 'Stock = 0', color: STATUS_META.empty.color, bg: STATUS_META.empty.bg },
                ].map(({ label, desc, color, bg }) => (
                  <div key={label} style={{ background: bg, border: `1px solid ${color}30`, borderRadius: 'var(--radius-sm)', padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, margin: '0 auto 4px' }} />
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color }}>{label}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--color-text-light)', marginTop: 2 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setAlertTarget(null)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={handleSaveAlert}
                disabled={alertLoading}
              >
                {alertLoading ? 'Guardando…' : 'Guardar alerta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
