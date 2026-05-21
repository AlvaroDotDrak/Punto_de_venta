/**
 * Visicooler — Control visual de stock de bebidas
 * Semáforo configurable por producto (min_stock_cooler)
 */
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '../context/ToastContext';
import { useSeller } from '../context/SellerContext';
import api from '../utils/api';
import { formatCurrency } from '../utils/formatters';
import {
  Thermometer, Plus, Minus, AlertTriangle, CheckCircle2,
  XCircle, Search, X, Settings, Package,
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
  const { currentSeller } = useSeller();
  const isAdmin = currentSeller?.role === 'admin';

  const [products, setProducts] = useState([]);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState('all'); // 'all' | 'ok' | 'low' | 'empty'

  // Modal reposición
  const [restockTarget, setRestockTarget] = useState(null);
  const [restockQty, setRestockQty]       = useState(1);
  const [restockLoading, setRestockLoading] = useState(false);

  // Modal configurar alerta
  const [alertTarget, setAlertTarget]   = useState(null);
  const [alertMin, setAlertMin]         = useState(DEFAULT_MIN);
  const [alertLoading, setAlertLoading] = useState(false);

  const loadProducts = async () => {
    const all = await api.get('/products?active_only=true');
    setProducts(all.filter(p => p.category === 'bebidas'));
  };

  useEffect(() => { loadProducts(); }, []);

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
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    // Orden: sin stock → bajo → ok → sin tracking
    const ord = { empty: 0, low: 1, ok: 2, none: 3 };
    return [...list].sort((a, b) => (ord[a.status] ?? 3) - (ord[b.status] ?? 3));
  }, [enriched, filter, search]);

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
          Visicooler
        </h1>
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
            placeholder="Buscar bebida…"
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

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-md)' }}>
            <Thermometer size={28} style={{ color: 'var(--color-text-light)' }} />
          </div>
          <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
            {search || filter !== 'all' ? 'Sin resultados' : 'No hay bebidas registradas'}
          </h3>
          <p style={{ fontSize: '0.875rem' }}>
            {search || filter !== 'all'
              ? 'Prueba con otro filtro o búsqueda.'
              : 'Agrega productos de categoría "bebidas" en el módulo Productos.'}
          </p>
        </div>
      ) : (
        <div className="vt-grid">
          {filtered.map(product => {
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
