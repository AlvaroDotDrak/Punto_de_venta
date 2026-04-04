/**
 * Vitrina — Sistema dual enteros/trozados
 * V3.0: consume FastAPI backend
 */
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '../context/ToastContext';
import { useSeller } from '../context/SellerContext';
import api from '../utils/api';
import {
  formatCurrency, getFreshnessStatus, hoursElapsed,
  minutesElapsed, formatElapsedTime, formatTimeRemaining,
} from '../utils/formatters';
import { Plus, Trash2, AlertTriangle, Store, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { startOfDay, endOfDay } from 'date-fns';

export default function Vitrina() {
  const toast = useToast();
  const { currentSeller } = useSeller();
  const isAdmin = currentSeller?.role === 'admin';

  const [showcaseItems, setShowcaseItems] = useState([]);
  const [allItems, setAllItems] = useState([]); // activos + removidos de hoy
  const [products, setProducts] = useState([]);
  const [showcaseTab, setShowcaseTab] = useState('enteros');
  const [search, setSearch] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [, setTick] = useState(0);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [addProductId, setAddProductId] = useState('');
  const [addType, setAddType] = useState('entero');
  const [removeTarget, setRemoveTarget] = useState(null);
  const [extendTarget, setExtendTarget] = useState(null);
  const [extendHours, setExtendHours] = useState(2);

  const loadData = async () => {
    const [active, prods] = await Promise.all([
      api.get('/showcase?status=active'),
      api.get('/products'),
    ]);
    setShowcaseItems(active);
    setProducts(prods);
  };

  useEffect(() => { loadData(); }, []);

  // Actualizar semáforos cada 60s
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);

  const enteros = useMemo(() => showcaseItems.filter(i => !i.showcase_type || i.showcase_type === 'entero'), [showcaseItems]);
  const trozados = useMemo(() => showcaseItems.filter(i => i.showcase_type === 'trozado'), [showcaseItems]);
  const currentItems = showcaseTab === 'enteros' ? enteros : trozados;

  const groupedItems = useMemo(() => {
    const grouped = currentItems.reduce((acc, item) => {
      const key = item.product_id;
      if (!acc[key]) acc[key] = { product_id: item.product_id, product: productMap[item.product_id], showcase_type: item.showcase_type || 'entero', items: [] };
      acc[key].items.push(item);
      return acc;
    }, {});

    return Object.values(grouped).map(group => {
      group.items.sort((a, b) => new Date(a.placed_at) - new Date(b.placed_at));
      const oldest = group.items[0];
      const effectiveTime = group.showcase_type === 'trozado' && oldest.sliced_at ? oldest.sliced_at : oldest.placed_at;
      const maxH = group.product?.max_showcase_hours || 48;
      return {
        ...group,
        oldest,
        effectiveTime,
        count: group.items.length,
        freshness: getFreshnessStatus(effectiveTime, maxH),
        elapsed: formatElapsedTime(effectiveTime),
        remaining: formatTimeRemaining(effectiveTime, maxH),
        pct: Math.min(100, (minutesElapsed(effectiveTime) / (maxH * 60)) * 100),
      };
    }).sort((a, b) => {
      const order = { danger: 0, warning: 1, fresh: 2 };
      return (order[a.freshness] || 2) - (order[b.freshness] || 2);
    });
  }, [currentItems, productMap]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groupedItems;
    const t = search.toLowerCase();
    return groupedItems.filter(g => g.product?.name?.toLowerCase().includes(t));
  }, [groupedItems, search]);

  const dangerCount = groupedItems.filter(g => g.freshness === 'danger').length;

  const dailyStats = useMemo(() => ({
    total: showcaseItems.length,
    enteros: enteros.length,
    trozados: trozados.length,
  }), [showcaseItems, enteros, trozados]);

  const availableProducts = useMemo(() =>
    products.filter(p => p.active && p.category !== 'encargo'), [products]);

  const handleAdd = async () => {
    if (!addProductId) { toast.error('Selecciona un producto'); return; }
    try {
      await api.post('/showcase', { product_id: parseInt(addProductId), showcase_type: addType });
      toast.success('Producto agregado a vitrina');
      setShowAddModal(false);
      setAddProductId('');
      loadData();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  const handleRemove = async (item) => {
    try {
      await api.post(`/showcase/${item.id}/remove`);
      toast.success('Item retirado de vitrina');
      setRemoveTarget(null);
      loadData();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  const handleExtend = async () => {
    if (!extendTarget) return;
    try {
      await api.post(`/showcase/${extendTarget.oldest.id}/extend?extra_hours=${extendHours}`);
      toast.success(`Tiempo extendido ${extendHours}h`);
      setExtendTarget(null);
      loadData();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  const freshnessColor = { fresh: 'var(--color-success)', warning: 'var(--color-warning)', danger: 'var(--color-danger)' };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Store size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Vitrina
          {dangerCount > 0 && <span className="badge badge-danger" style={{ marginLeft: 8 }}>{dangerCount} por vencer</span>}
        </h1>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={16} /> Agregar
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
        {[
          { label: 'Total en vitrina', value: dailyStats.total },
          { label: 'Enteros', value: dailyStats.enteros },
          { label: 'Trozos', value: dailyStats.trozados },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ flex: 1, minWidth: 100 }}>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs + Search */}
      <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
        <div className="tabs">
          <button className={`tab ${showcaseTab === 'enteros' ? 'active' : ''}`} onClick={() => setShowcaseTab('enteros')}>
            Enteros ({enteros.length})
          </button>
          <button className={`tab ${showcaseTab === 'trozados' ? 'active' : ''}`} onClick={() => setShowcaseTab('trozados')}>
            Trozados ({trozados.length})
          </button>
        </div>
        <div className="search-bar" style={{ flex: 1, minWidth: 180 }}>
          <Search className="search-icon" size={16} />
          <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Items grid */}
      <div className="showcase-grid">
        {filteredGroups.length === 0 ? (
          <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
            <Store size={48} />
            <h3>Vitrina vacía</h3>
            <p>Agrega productos para comenzar</p>
          </div>
        ) : filteredGroups.map(group => (
          <div key={group.product_id} className={`showcase-card freshness-${group.freshness}`}>
            <div className="showcase-card-header">
              <div>
                <div className="showcase-card-name">{group.product?.name || 'Producto'}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                  {group.count} {group.showcase_type === 'trozado' ? 'trozo(s)' : 'unidad(es)'}
                </div>
              </div>
              <span className={`freshness-dot freshness-${group.freshness}`} />
            </div>

            {/* Progress bar */}
            <div className="freshness-bar">
              <div className="freshness-bar-fill" style={{ width: `${group.pct}%`, background: freshnessColor[group.freshness] }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-light)', marginTop: 2 }}>
              <span>{group.elapsed}</span>
              <span>{group.remaining} restante</span>
            </div>

            {group.freshness === 'danger' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-danger)', fontSize: '0.8rem', marginTop: 4 }}>
                <AlertTriangle size={12} /> Tiempo vencido
              </div>
            )}

            {isAdmin && (
              <div style={{ display: 'flex', gap: 4, marginTop: 'var(--space-sm)' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setExtendTarget(group)}>+Tiempo</button>
                <button className="btn btn-danger btn-sm" onClick={() => setRemoveTarget(group.oldest)}>
                  <Trash2 size={12} /> Retirar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Agregar a Vitrina</h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Producto</label>
                <select className="form-input" value={addProductId} onChange={e => setAddProductId(e.target.value)} autoFocus>
                  <option value="">Seleccionar...</option>
                  {availableProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  {['entero', 'trozado'].map(t => (
                    <button key={t} className={`btn ${addType === t ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setAddType(t)}>{t === 'entero' ? 'Entero' : 'Trozado'}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleAdd}>Agregar</button>
            </div>
          </div>
        </div>
      )}

      {/* Remove modal */}
      {removeTarget && (
        <div className="modal-overlay" onClick={() => setRemoveTarget(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Retirar de Vitrina</h2>
              <button className="modal-close" onClick={() => setRemoveTarget(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p>¿Retirar este item de la vitrina? Se marcará como removido.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setRemoveTarget(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={() => handleRemove(removeTarget)}>Retirar</button>
            </div>
          </div>
        </div>
      )}

      {/* Extend modal */}
      {extendTarget && (
        <div className="modal-overlay" onClick={() => setExtendTarget(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Extender Tiempo — {extendTarget.product?.name}</h2>
              <button className="modal-close" onClick={() => setExtendTarget(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Horas adicionales</label>
                <input type="number" className="form-input" min="1" max="48" value={extendHours}
                  onChange={e => setExtendHours(parseInt(e.target.value) || 1)} autoFocus />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setExtendTarget(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleExtend}>Extender</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
