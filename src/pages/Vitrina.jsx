/**
 * Vitrina — Sistema dual enteros/trozados
 * V3.2: CSS vt-* añadidos, bugs corregidos, mejoras UX
 */
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '../context/ToastContext';
import { useSeller } from '../context/SellerContext';
import api from '../utils/api';
import {
  formatCurrency, getFreshnessStatus,
  minutesElapsed, formatElapsedTime, formatTimeRemaining,
} from '../utils/formatters';
import {
  Plus, Trash2, AlertTriangle, Store, Search, Clock,
  Timer, CheckCircle2, X, Package, Layers, Hash, Scissors
} from 'lucide-react';

const FRESHNESS_META = {
  fresh:   { label: 'Fresco',      color: '#2E8B57', bg: 'rgba(46,139,87,0.06)',  border: 'rgba(46,139,87,0.25)',  icon: CheckCircle2 },
  warning: { label: 'Próximo',     color: '#C8820A', bg: 'rgba(200,130,10,0.06)', border: 'rgba(200,130,10,0.3)',  icon: Timer },
  danger:  { label: 'Vencido',     color: '#C0392B', bg: 'rgba(192,57,43,0.06)',  border: 'rgba(192,57,43,0.35)', icon: AlertTriangle },
  none:    { label: 'Sin control', color: '#7A8B9A', bg: 'rgba(122,139,154,0.04)', border: 'rgba(122,139,154,0.2)', icon: Package },
};

export default function Vitrina() {
  const toast = useToast();
  const { currentSeller } = useSeller();
  const isAdmin = currentSeller?.role === 'admin';

  const [showcaseItems, setShowcaseItems] = useState([]);
  const [products, setProducts]           = useState([]);
  const [showcaseTab, setShowcaseTab]     = useState('enteros');
  const [search, setSearch]               = useState('');
  const [, setTick]                       = useState(0);

  const [showAddModal,  setShowAddModal]  = useState(false);
  const [addProductId,  setAddProductId]  = useState('');
  const [addSearch,     setAddSearch]     = useState('');
  const [addDropOpen,   setAddDropOpen]   = useState(false);
  const [addType,       setAddType]       = useState('entero');
  const [addQuantity,   setAddQuantity]   = useState(1);
  const [addLoading,    setAddLoading]    = useState(false);

  const [removeTarget,  setRemoveTarget]  = useState(null); // group
  const [extendTarget,  setExtendTarget]  = useState(null); // group
  const [extendHours,   setExtendHours]   = useState(2);
  const [sliceTarget,   setSliceTarget]   = useState(null); // group (entero a trozar)
  const [sliceQty,      setSliceQty]      = useState(8);
  const [slicePrice,    setSlicePrice]    = useState('');
  const [sliceLoading,  setSliceLoading]  = useState(false);

  const loadData = async () => {
    const [active, prods] = await Promise.all([
      api.get('/showcase?status=active'),
      api.get('/products'),
    ]);
    setShowcaseItems(active);
    setProducts(prods);
  };

  useEffect(() => { loadData(); }, []);

  // Actualiza el reloj cada minuto
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const productMap = useMemo(() =>
    Object.fromEntries(products.map(p => [p.id, p])), [products]);

  const enteros  = useMemo(() => showcaseItems.filter(i => i.showcase_type === 'entero' || !i.showcase_type), [showcaseItems]);
  const trozados = useMemo(() => showcaseItems.filter(i => i.showcase_type === 'trozado'), [showcaseItems]);
  const current  = showcaseTab === 'enteros' ? enteros : trozados;

  const groups = useMemo(() => {
    const map = {};
    for (const item of current) {
      const k = item.product_id;
      if (!map[k]) map[k] = {
        product_id: k,
        product: productMap[k],
        showcase_type: item.showcase_type || 'entero',
        items: [],
      };
      map[k].items.push(item);
    }
    return Object.values(map).map(g => {
      g.items.sort((a, b) => new Date(a.placed_at) - new Date(b.placed_at));
      const oldest = g.items[0];
      const refDate = g.showcase_type === 'trozado' && oldest.sliced_at
        ? oldest.sliced_at
        : oldest.placed_at;
      const maxH = g.product?.max_showcase_hours ?? null;
      const freshness = getFreshnessStatus(refDate, maxH);
      return {
        ...g,
        count: g.items.length,
        oldest,
        freshness,
        elapsed:   formatElapsedTime(refDate),
        remaining: maxH ? formatTimeRemaining(refDate, maxH) : null,
        pct:       maxH ? Math.min(100, (minutesElapsed(refDate) / (maxH * 60)) * 100) : null,
      };
    }).sort((a, b) => {
      const o = { danger: 0, warning: 1, fresh: 2 };
      return (o[a.freshness] ?? 2) - (o[b.freshness] ?? 2);
    });
  }, [current, productMap]);

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter(g => g.product?.name?.toLowerCase().includes(q));
  }, [groups, search]);

  const dangerCount  = groups.filter(g => g.freshness === 'danger').length;
  const warningCount = groups.filter(g => g.freshness === 'warning').length;

  const available = useMemo(() =>
    products.filter(p => p.active && !['encargo', 'bebidas', 'cafe'].includes(p.category)), [products]);

  const addFiltered = useMemo(() => {
    if (!addSearch.trim()) return available;
    const q = addSearch.toLowerCase();
    return available.filter(p => p.name.toLowerCase().includes(q));
  }, [available, addSearch]);

  const selectedProduct = useMemo(() =>
    available.find(p => p.id === parseInt(addProductId)) ?? null, [available, addProductId]);

  const selectProduct = (p) => {
    setAddProductId(String(p.id));
    setAddSearch(p.name);
    setAddDropOpen(false);
  };

  // ── HANDLERS ───────────────────────────────────────
  const handleAdd = async () => {
    if (!addProductId) { toast.error('Selecciona un producto'); return; }
    setAddLoading(true);
    try {
      // Agregar N unidades en secuencia
      for (let i = 0; i < addQuantity; i++) {
        await api.post('/showcase', {
          product_id: parseInt(addProductId),
          showcase_type: addType,
        });
      }
      const prod = available.find(p => p.id === parseInt(addProductId));
      toast.success(`${addQuantity} ${addType}${addQuantity > 1 ? 's' : ''} de "${prod?.name}" agregado${addQuantity > 1 ? 's' : ''}`);
      setShowAddModal(false);
      setAddProductId('');
      setAddQuantity(1);
      loadData();
    } catch (err) {
      toast.error('Error al agregar: ' + err.message);
    } finally {
      setAddLoading(false);
    }
  };

  // Retira UN item del grupo (el más antiguo)
  const handleRemoveOne = async (group) => {
    try {
      await api.post(`/showcase/${group.oldest.id}/remove`);
      toast.success('Item retirado de vitrina');
      setRemoveTarget(null);
      loadData();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  // Retira TODOS los items del grupo
  const handleRemoveAll = async (group) => {
    try {
      for (const item of group.items) {
        await api.post(`/showcase/${item.id}/remove`);
      }
      toast.success(`${group.count} item${group.count > 1 ? 's' : ''} retirado${group.count > 1 ? 's' : ''}`);
      setRemoveTarget(null);
      loadData();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  const handleSlice = async () => {
    if (!sliceTarget) return;
    const price = parseFloat(slicePrice);
    if (!price || price <= 0) { toast.error('Ingresa un precio válido para el trozo'); return; }
    setSliceLoading(true);
    try {
      // Guardar precio del trozo en el producto si cambió
      if (price !== sliceTarget.product?.slice_price) {
        await api.patch(`/products/${sliceTarget.product_id}`, { slice_price: price });
      }
      await api.post(`/showcase/${sliceTarget.oldest.id}/slice?slices=${sliceQty}`);
      toast.success(`"${sliceTarget.product?.name}" trozado en ${sliceQty} trozos a ${formatCurrency(price)} c/u`);
      setSliceTarget(null);
      setShowcaseTab('trozados');
      loadData();
    } catch (err) {
      toast.error('Error: ' + err.message);
    } finally {
      setSliceLoading(false);
    }
  };

  const handleExtend = async () => {
    if (!extendTarget) return;
    try {
      // Extender el item más antiguo del grupo
      await api.post(`/showcase/${extendTarget.oldest.id}/extend?extra_hours=${extendHours}`);
      toast.success(`Tiempo extendido +${extendHours}h`);
      setExtendTarget(null);
      loadData();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  // ── RENDER ─────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">
          <Store size={26} style={{ verticalAlign: 'middle', marginRight: 10 }} />
          Vitrina
        </h1>
        <button className="btn btn-primary" onClick={() => { setAddProductId(''); setAddSearch(''); setAddDropOpen(false); setAddType('entero'); setAddQuantity(1); setShowAddModal(true); }}>
          <Plus size={16} /> Agregar
        </button>
      </div>

      {/* Stats */}
      <div className="vt-stats">
        <div className="vt-stat">
          <div className="vt-stat-value">{showcaseItems.length}</div>
          <div className="vt-stat-label">Total en vitrina</div>
        </div>
        <div className="vt-stat">
          <div className="vt-stat-value">{enteros.length}</div>
          <div className="vt-stat-label">Enteros</div>
        </div>
        <div className="vt-stat">
          <div className="vt-stat-value">{trozados.length}</div>
          <div className="vt-stat-label">Trozos</div>
        </div>
        {warningCount > 0 && (
          <div className="vt-stat vt-stat-warning">
            <div className="vt-stat-value">{warningCount}</div>
            <div className="vt-stat-label">Próximos a vencer</div>
          </div>
        )}
        {dangerCount > 0 && (
          <div className="vt-stat vt-stat-danger">
            <div className="vt-stat-value">{dangerCount}</div>
            <div className="vt-stat-label">Vencido{dangerCount > 1 ? 's' : ''}</div>
          </div>
        )}
      </div>

      {/* Alert banner */}
      {dangerCount > 0 && (
        <div className="vt-alert">
          <AlertTriangle size={16} />
          <strong>{dangerCount} producto{dangerCount > 1 ? 's' : ''}</strong>
          {dangerCount > 1 ? ' han' : ' ha'} superado el tiempo máximo de exposición. Retíralos o extiende su tiempo.
        </div>
      )}

      {/* Toolbar: tabs + búsqueda */}
      <div className="vt-toolbar">
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button className={`tab ${showcaseTab === 'enteros' ? 'active' : ''}`} onClick={() => setShowcaseTab('enteros')}>
            <Layers size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Enteros
            <span className="vt-tab-count">{enteros.length}</span>
          </button>
          <button className={`tab ${showcaseTab === 'trozados' ? 'active' : ''}`} onClick={() => setShowcaseTab('trozados')}>
            <Package size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Trozados
            <span className="vt-tab-count">{trozados.length}</span>
          </button>
        </div>
        <div className="search-bar" style={{ flex: 1, minWidth: 180, maxWidth: 320, marginBottom: 0 }}>
          <Search className="search-icon" size={15} />
          <input
            type="text" placeholder="Buscar producto…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-light)', display: 'flex' }}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Grid de cards */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-md)' }}>
            <Store size={28} style={{ color: 'var(--color-text-light)' }} />
          </div>
          <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
            {search ? 'Sin resultados' : `No hay ${showcaseTab} en vitrina`}
          </h3>
          <p style={{ fontSize: '0.875rem' }}>
            {search ? 'Ningún producto coincide con la búsqueda.' : 'Agrega productos para comenzar.'}
          </p>
          {!search && (
            <button className="btn btn-primary" style={{ marginTop: 'var(--space-md)' }}
              onClick={() => { setAddType(showcaseTab === 'enteros' ? 'entero' : 'trozado'); setShowAddModal(true); }}>
              <Plus size={15} /> Agregar {showcaseTab === 'enteros' ? 'entero' : 'trozado'}
            </button>
          )}
        </div>
      ) : (
        <div className="vt-grid">
          {filtered.map(group => {
            const meta  = FRESHNESS_META[group.freshness] || FRESHNESS_META.fresh;
            const FIcon = meta.icon;
            const photo = group.product?.photo;
            const emoji = group.product?.category === 'salados' ? '🥪' : group.showcase_type === 'trozado' ? '🍰' : '🎂';

            return (
              <div
                key={group.product_id}
                className="vt-card"
                style={{ borderColor: meta.border, background: meta.bg }}
              >
                {/* Barra lateral de color */}
                <div className="vt-card-accent" style={{ background: meta.color }} />

                {/* Thumbnail */}
                <div className="vt-card-thumb">
                  {photo ? <img src={photo} alt={group.product?.name} /> : <span>{emoji}</span>}
                </div>

                {/* Contenido */}
                <div className="vt-card-body">
                  {/* Nombre + badge */}
                  <div className="vt-card-top">
                    <div>
                      <div className="vt-card-name">{group.product?.name || 'Producto'}</div>
                      <div className="vt-card-sub">
                        <Hash size={10} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                        <strong>{group.count}</strong> {group.showcase_type === 'trozado' ? 'trozo' : 'unidad'}{group.count !== 1 ? 's' : ''}
                        {group.product?.price && (
                          <> · {formatCurrency(group.product.price)}</>
                        )}
                      </div>
                    </div>
                    <div
                      className="vt-badge"
                      style={{ background: meta.color + '18', color: meta.color, borderColor: meta.color + '40' }}
                    >
                      <FIcon size={11} />
                      {meta.label}
                    </div>
                  </div>

                  {/* Barra de progreso de frescura (solo si tiene control de tiempo) */}
                  {group.freshness !== 'none' ? (
                    <div className="vt-progress-wrap">
                      <div className="vt-progress-bar">
                        <div
                          className="vt-progress-fill"
                          style={{ width: `${group.pct}%`, background: meta.color }}
                        />
                      </div>
                      <div className="vt-progress-labels">
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Clock size={10} /> {group.elapsed}
                        </span>
                        <span style={{ color: group.freshness === 'danger' ? meta.color : undefined }}>
                          {group.pct >= 100 ? '¡Vencido!' : group.remaining}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-light)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <Clock size={10} /> En vitrina desde {group.elapsed}
                    </div>
                  )}

                  {/* Acciones */}
                  <div className="vt-card-actions">
                    {isAdmin && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.78rem' }}
                        onClick={() => { setExtendTarget(group); setExtendHours(2); }}
                        title="Extender tiempo de exposición"
                      >
                        <Timer size={12} /> +Tiempo
                      </button>
                    )}
                    {group.showcase_type === 'entero' && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.78rem' }}
                        onClick={() => {
                        setSliceTarget(group);
                        setSliceQty(group.product?.slices ?? 8);
                        setSlicePrice(group.product?.slice_price ?? 3000);
                      }}
                        title="Trozar pastel"
                      >
                        <Scissors size={12} /> Trozar
                      </button>
                    )}
                    <button
                      className="btn btn-danger btn-sm"
                      style={{ fontSize: '0.78rem' }}
                      onClick={() => setRemoveTarget(group)}
                      title="Retirar de vitrina"
                    >
                      <Trash2 size={12} /> Retirar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAL: AGREGAR ──────────────────────────── */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--color-primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Store size={16} style={{ color: 'var(--color-primary)' }} />
                </div>
                <h2 style={{ fontSize: '1rem' }}>Agregar a Vitrina</h2>
              </div>
              <button className="modal-close" onClick={() => setShowAddModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {/* Producto — buscador */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Producto</label>
                <div style={{ position: 'relative' }}>
                  {/* Input de búsqueda */}
                  <div style={{ position: 'relative' }}>
                    <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)', pointerEvents: 'none' }} />
                    <input
                      type="text"
                      className="form-input"
                      style={{ paddingLeft: 34, paddingRight: addProductId ? 34 : undefined }}
                      placeholder="Buscar producto…"
                      value={addSearch}
                      autoFocus
                      onChange={e => { setAddSearch(e.target.value); setAddProductId(''); setAddDropOpen(true); }}
                      onFocus={() => setAddDropOpen(true)}
                      onBlur={() => setTimeout(() => setAddDropOpen(false), 150)}
                    />
                    {addProductId && (
                      <button
                        onClick={() => { setAddSearch(''); setAddProductId(''); setAddDropOpen(true); }}
                        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-light)', display: 'flex' }}
                      ><X size={14} /></button>
                    )}
                  </div>

                  {/* Dropdown */}
                  {addDropOpen && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
                      background: 'var(--color-bg-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: 'var(--shadow-md)',
                      maxHeight: 240, overflowY: 'auto',
                    }}>
                      {addFiltered.length === 0 ? (
                        <div style={{ padding: '14px 16px', fontSize: '0.85rem', color: 'var(--color-text-light)', textAlign: 'center' }}>
                          Sin resultados
                        </div>
                      ) : addFiltered.map((p, idx) => (
                        <button
                          key={p.id}
                          onMouseDown={() => selectProduct(p)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            width: '100%', padding: '9px 14px',
                            background: addProductId === String(p.id) ? 'var(--color-primary-bg)' : 'transparent',
                            border: 'none',
                            borderBottom: idx < addFiltered.length - 1 ? '1px solid var(--color-border)' : 'none',
                            cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          {p.photo
                            ? <img src={p.photo} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                            : <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--color-primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>
                                {p.category === 'vitrina' ? '🍰' : '🥪'}
                              </div>
                          }
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{p.category}</div>
                          </div>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-primary)', flexShrink: 0 }}>
                            {formatCurrency(p.price)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Producto seleccionado */}
                {selectedProduct && (
                  <div style={{
                    marginTop: 8, padding: '8px 12px', borderRadius: 'var(--radius-md)',
                    background: 'var(--color-primary-bg)', border: '1px solid var(--color-primary-light)',
                    display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.85rem',
                  }}>
                    <CheckCircle2 size={15} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{selectedProduct.name}</span>
                    <span style={{ color: 'var(--color-text-secondary)', marginLeft: 'auto' }}>{formatCurrency(selectedProduct.price)}</span>
                  </div>
                )}
              </div>

              {/* Tipo */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tipo</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
                  {[['entero', '🎂 Entero'], ['trozado', '🍰 Trozado']].map(([val, lbl]) => (
                    <button key={val}
                      className={`btn ${addType === val ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setAddType(val)}
                      style={{ justifyContent: 'center' }}
                    >{lbl}</button>
                  ))}
                </div>
              </div>

              {/* Cantidad */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Cantidad a agregar</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setAddQuantity(q => Math.max(1, q - 1))}>−</button>
                  <span style={{ minWidth: 40, textAlign: 'center', fontWeight: 700, fontSize: '1.1rem' }}>{addQuantity}</span>
                  <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setAddQuantity(q => Math.min(20, q + 1))}>+</button>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginLeft: 4 }}>
                    {addType === 'entero' ? 'entero' : 'trozo'}{addQuantity > 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={!addProductId || addLoading}>
                {addLoading ? 'Agregando…' : `Agregar ${addQuantity > 1 ? addQuantity + ' ' : ''}${addType}${addQuantity > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: RETIRAR ──────────────────────────── */}
      {removeTarget && (
        <div className="modal-overlay" onClick={() => setRemoveTarget(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--color-danger-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={16} style={{ color: 'var(--color-danger)' }} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1rem' }}>Retirar de Vitrina</h2>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 1 }}>
                    {removeTarget.product?.name} · {removeTarget.count} {removeTarget.showcase_type}{removeTarget.count > 1 ? 's' : ''} en vitrina
                  </div>
                </div>
              </div>
              <button className="modal-close" onClick={() => setRemoveTarget(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
                ¿Cuántos ítems deseas retirar?
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleRemoveOne(removeTarget)}
                  style={{ flexDirection: 'column', height: 'auto', padding: 'var(--space-md)', gap: 4 }}
                >
                  <span style={{ fontWeight: 700, fontSize: '1.3rem' }}>1</span>
                  <span style={{ fontSize: '0.78rem' }}>Solo el más antiguo</span>
                  {removeTarget.count > 1 && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-light)' }}>Quedan {removeTarget.count - 1}</span>
                  )}
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => handleRemoveAll(removeTarget)}
                  style={{ flexDirection: 'column', height: 'auto', padding: 'var(--space-md)', gap: 4 }}
                >
                  <span style={{ fontWeight: 700, fontSize: '1.3rem' }}>{removeTarget.count}</span>
                  <span style={{ fontSize: '0.78rem' }}>Todos</span>
                  <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>Vaciar vitrina</span>
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setRemoveTarget(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: TROZAR ──────────────────────────── */}
      {sliceTarget && (
        <div className="modal-overlay" onClick={() => setSliceTarget(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--color-primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Scissors size={16} style={{ color: 'var(--color-primary)' }} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1rem' }}>Trozar Pastel</h2>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 1 }}>
                    {sliceTarget.product?.name}
                  </div>
                </div>
              </div>
              <button className="modal-close" onClick={() => setSliceTarget(null)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <div style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-md)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-md)',
                fontSize: '0.875rem',
              }}>
                <span style={{ fontSize: '1.8rem' }}>🎂</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>→</span>
                <span style={{ fontSize: '1.4rem' }}>🍰</span>
                <span style={{ fontWeight: 600 }}>× {sliceQty} trozos</span>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Cantidad de trozos</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginTop: 4 }}>
                  <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setSliceQty(q => Math.max(1, q - 1))}>−</button>
                  <span style={{ minWidth: 40, textAlign: 'center', fontWeight: 700, fontSize: '1.2rem' }}>{sliceQty}</span>
                  <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setSliceQty(q => Math.min(30, q + 1))}>+</button>
                </div>
                {(sliceTarget.product?.slices ?? 8) !== sliceQty && (
                  <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--color-text-light)' }}>
                    Predeterminado: {sliceTarget.product?.slices ?? 8} trozos
                    <button
                      onClick={() => setSliceQty(sliceTarget.product?.slices ?? 8)}
                      style={{ marginLeft: 6, padding: '1px 8px', border: '1px solid var(--color-border)', borderRadius: 99, background: 'transparent', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}
                    >
                      Restaurar
                    </button>
                  </div>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Precio por trozo</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginTop: 4 }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>$</span>
                  <input
                    type="number"
                    className="form-input"
                    style={{ maxWidth: 140 }}
                    value={slicePrice}
                    onChange={e => setSlicePrice(e.target.value)}
                    min={1}
                    step={100}
                  />
                </div>
                {sliceTarget.product?.slice_price && sliceTarget.product.slice_price !== parseFloat(slicePrice) && (
                  <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--color-text-light)' }}>
                    Precio guardado: {formatCurrency(sliceTarget.product.slice_price)}
                    <button
                      onClick={() => setSlicePrice(sliceTarget.product.slice_price)}
                      style={{ marginLeft: 6, padding: '1px 8px', border: '1px solid var(--color-border)', borderRadius: 99, background: 'transparent', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}
                    >
                      Restaurar
                    </button>
                  </div>
                )}
                <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--color-text-light)' }}>
                  Se guardará como precio predeterminado para trozos de este producto.
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSliceTarget(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSlice} disabled={sliceLoading}>
                <Scissors size={14} /> {sliceLoading ? 'Trozando…' : `Trozar en ${sliceQty}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: EXTENDER TIEMPO ──────────────────── */}
      {extendTarget && (
        <div className="modal-overlay" onClick={() => setExtendTarget(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--color-warning-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Timer size={16} style={{ color: 'var(--color-warning)' }} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1rem' }}>Extender Tiempo</h2>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 1 }}>
                    {extendTarget.product?.name} · lleva {extendTarget.elapsed}
                  </div>
                </div>
              </div>
              <button className="modal-close" onClick={() => setExtendTarget(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Horas adicionales de exposición</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginTop: 4 }}>
                  <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setExtendHours(h => Math.max(1, h - 1))}>−</button>
                  <span style={{ minWidth: 40, textAlign: 'center', fontWeight: 700, fontSize: '1.2rem' }}>{extendHours}</span>
                  <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setExtendHours(h => Math.min(48, h + 1))}>+</button>
                  <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>hora{extendHours > 1 ? 's' : ''}</span>
                </div>
                <div style={{ marginTop: 'var(--space-sm)', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                  Atajos:
                  {[1, 2, 4, 8].map(h => (
                    <button key={h} onClick={() => setExtendHours(h)}
                      style={{ marginLeft: 6, padding: '2px 10px', border: `1px solid var(--color-border)`, borderRadius: 99, background: extendHours === h ? 'var(--color-primary)' : 'transparent', color: extendHours === h ? '#fff' : 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                      {h}h
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setExtendTarget(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleExtend}>
                <Timer size={14} /> Extender +{extendHours}h
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
