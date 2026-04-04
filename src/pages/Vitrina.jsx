/**
 * Vitrina — Dual showcase system (Enteros / Trozados)
 *
 * FEATURES:
 * - Grouped view by product with freshness semaphore + progress bar
 * - Time remaining displayed (instead of elapsed)
 * - Search/filter within active showcase
 * - Daily KPIs: vendidos, retirados, ingresados hoy
 * - Historial del día: collapsible movement log
 * - Restock alert: products that ran out today
 * - [ADMIN] Anular ingreso: cancel items without counting as merma
 * - [ADMIN] Extender tiempo: increase max showcase hours per item batch
 */
import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useToast } from '../context/ToastContext';
import { useSeller } from '../context/SellerContext';
import { logAction, ACTIONS } from '../utils/auditLog';
import {
  formatCurrency, formatElapsedTime, getFreshnessStatus,
  hoursElapsed, minutesElapsed, formatTimeRemaining,
} from '../utils/formatters';
import {
  Plus, Trash2, AlertTriangle, Store, Scissors, Package, Eye,
  Search, ShoppingCart, RefreshCw, ChevronDown, ChevronUp, Clock,
} from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';
import AddModal from '../components/Vitrina/AddModal';
import SliceModal from '../components/Vitrina/SliceModal';
import DetailModal from '../components/Vitrina/DetailModal';
import RemoveModal from '../components/Vitrina/RemoveModal';
import ExtendModal from '../components/Vitrina/ExtendModal';

export default function Vitrina() {
  const toast = useToast();
  const { currentSeller } = useSeller();
  const isAdmin = currentSeller?.role === 'admin';

  // UI state
  const [showcaseTab, setShowcaseTab] = useState('enteros');
  const [vitrineSearch, setVitrinaSearch] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // Modal visibility
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSliceModal, setShowSliceModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);

  // Batch remove state
  const [removeGroup, setRemoveGroup] = useState(null);
  const [removeQty, setRemoveQty] = useState('1');
  const [removeReason, setRemoveReason] = useState('Vencido');

  // Detail modal state
  const [detailGroup, setDetailGroup] = useState(null);
  const [selectedDetailItems, setSelectedDetailItems] = useState([]);
  const [removeDetailReason, setRemoveDetailReason] = useState('Vencido');

  // Slice modal state
  const [sliceTarget, setSliceTarget] = useState(null);
  const [sliceCount, setSliceCount] = useState('6');
  const [slicePrice, setSlicePrice] = useState('');

  // Extend modal state
  const [extendTarget, setExtendTarget] = useState(null);
  const [extendHours, setExtendHours] = useState(2);

  // Search in AddModal
  const [searchProduct, setSearchProduct] = useState('');

  const [, setTick] = useState(0);

  // Auto-update freshness every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  // === Queries ===

  const allShowcaseItems = useLiveQuery(async () => {
    const items = await db.showcaseItems.where('status').anyOf(['active']).toArray();
    const productIds = [...new Set(items.map(i => i.productId))];
    const products = await db.products.where('id').anyOf(productIds).toArray();
    const productMap = Object.fromEntries(products.map(p => [p.id, p]));
    return items.map(item => ({
      ...item,
      product: productMap[item.productId] || { name: 'Desconocido', price: 0, maxShowcaseHours: 48 },
    })).sort((a, b) => new Date(a.placedAt) - new Date(b.placedAt));
  }, [], []);

  const allProducts = useLiveQuery(() => db.products.toArray(), [], []);
  const productMap = useMemo(
    () => Object.fromEntries(allProducts.map(p => [p.id, p])),
    [allProducts]
  );

  const todayActivity = useLiveQuery(async () => {
    const start = startOfDay(new Date()).toISOString();
    const end = endOfDay(new Date()).toISOString();
    const placed = await db.showcaseItems
      .where('placedAt').between(start, end, true, true).toArray();
    const removed = await db.showcaseItems
      .where('removedAt').between(start, end, true, true).toArray();
    return { placed, removed };
  }, [], { placed: [], removed: [] });

  const availableProducts = useLiveQuery(
    () => db.products.filter(p => p.active !== false && p.category !== 'encargo').toArray(),
    [], []
  );

  // === Derived data ===

  const enteros = useMemo(
    () => allShowcaseItems.filter(i => !i.showcaseType || i.showcaseType === 'entero'),
    [allShowcaseItems]
  );
  const trozados = useMemo(
    () => allShowcaseItems.filter(i => i.showcaseType === 'trozado'),
    [allShowcaseItems]
  );
  const currentItems = showcaseTab === 'enteros' ? enteros : trozados;

  const groupedItems = useMemo(() => {
    const grouped = currentItems.reduce((acc, item) => {
      const key = item.productId;
      if (!acc[key]) {
        acc[key] = {
          productId: item.productId,
          product: item.product,
          showcaseType: item.showcaseType || 'entero',
          items: [],
          count: 0,
        };
      }
      acc[key].items.push(item);
      acc[key].count++;
      return acc;
    }, {});

    return Object.values(grouped).map(group => {
      group.items.sort((a, b) => new Date(a.placedAt) - new Date(b.placedAt));
      const oldestItem = group.items[0];
      const effectiveTime = group.showcaseType === 'trozado' && oldestItem.slicedAt
        ? oldestItem.slicedAt
        : oldestItem.placedAt;

      // Extension: add extendedHours from the oldest item (same value applied to all)
      const baseMaxH = group.product.maxShowcaseHours || 48;
      const extraH = oldestItem.extendedHours || 0;
      const maxH = baseMaxH + extraH;

      group.oldestItem = oldestItem;
      group.effectiveTime = effectiveTime;
      group.freshnessStatus = getFreshnessStatus(effectiveTime, maxH);
      group.oldestHours = hoursElapsed(effectiveTime);
      group.oldestElapsed = formatElapsedTime(effectiveTime);
      group.timeRemaining = formatTimeRemaining(effectiveTime, maxH);
      group.freshnessPct = Math.min(100, (minutesElapsed(effectiveTime) / (maxH * 60)) * 100);
      group.maxH = maxH;
      group.baseMaxH = baseMaxH;
      group.extendedHours = extraH;
      group.isExtended = extraH > 0;
      return group;
    }).sort((a, b) => {
      const order = { danger: 0, warning: 1, fresh: 2 };
      return (order[a.freshnessStatus] || 2) - (order[b.freshnessStatus] || 2);
    });
  }, [currentItems]);

  const filteredGroups = useMemo(() => {
    if (!vitrineSearch.trim()) return groupedItems;
    const term = vitrineSearch.toLowerCase();
    return groupedItems.filter(g => g.product.name.toLowerCase().includes(term));
  }, [groupedItems, vitrineSearch]);

  const dangerCount = useMemo(() => allShowcaseItems.filter(item => {
    const effectiveTime = item.showcaseType === 'trozado' && item.slicedAt
      ? item.slicedAt : item.placedAt;
    const baseMaxH = item.product?.maxShowcaseHours || 48;
    const maxH = baseMaxH + (item.extendedHours || 0);
    return getFreshnessStatus(effectiveTime, maxH) === 'danger';
  }).length, [allShowcaseItems]);

  // Daily stats — 'cancelled' excluded from merma intentionally
  const dailyStats = useMemo(() => {
    const { placed, removed } = todayActivity;
    return {
      addedToday: placed.filter(i => i.showcaseType === 'entero').length,
      soldToday: removed.filter(i => i.status === 'sold').length,
      mermaToday: removed.filter(i => i.status === 'removed').length,
    };
  }, [todayActivity]);

  const restockNeeded = useMemo(() => {
    const { placed } = todayActivity;
    const activeProductIds = new Set(allShowcaseItems.map(i => i.productId));
    const todayProductIds = new Set(
      placed.filter(i => i.showcaseType === 'entero').map(i => i.productId)
    );
    return [...todayProductIds]
      .filter(id => !activeProductIds.has(id))
      .map(id => productMap[id])
      .filter(Boolean);
  }, [todayActivity, allShowcaseItems, productMap]);

  const todayMovementsLog = useMemo(() => {
    const { placed, removed } = todayActivity;
    const entries = {};

    const add = (key, obj) => {
      if (!entries[key]) entries[key] = { ...obj, count: 0 };
      entries[key].count++;
    };

    placed.forEach(item => {
      if (item.showcaseType === 'entero') {
        add(`add-${item.productId}-${item.placedAt}`, {
          productId: item.productId, time: item.placedAt, type: 'added',
        });
      } else if (item.showcaseType === 'trozado') {
        const t = item.slicedAt || item.placedAt;
        add(`slice-${item.productId}-${t}`, {
          productId: item.productId, time: t, type: 'sliced',
        });
      }
    });

    removed.forEach(item => {
      if (item.status === 'sliced') return;
      const type = item.status === 'sold' ? 'sold'
        : item.status === 'cancelled' ? 'cancelled'
        : 'removed';
      const key = `${type}-${item.productId}-${item.removedAt}-${item.removeReason || ''}`;
      add(key, {
        productId: item.productId,
        time: item.removedAt,
        type,
        reason: item.removeReason,
      });
    });

    return Object.values(entries).sort((a, b) => new Date(b.time) - new Date(a.time));
  }, [todayActivity]);

  const filteredAvailable = useMemo(() => {
    if (!searchProduct) return availableProducts;
    const term = searchProduct.toLowerCase();
    return availableProducts.filter(p => p.name.toLowerCase().includes(term));
  }, [availableProducts, searchProduct]);

  // === Handlers ===

  const addToShowcase = async (product, qty = 1) => {
    try {
      const now = new Date().toISOString();
      const items = Array.from({ length: qty }, () => ({
        productId: product.id,
        placedAt: now,
        removedAt: null,
        status: 'active',
        showcaseType: 'entero',
        parentId: null,
        slicedAt: null,
      }));
      await db.showcaseItems.bulkAdd(items);
      toast.success(`${qty}x ${product.name} agregado(s) a vitrina`);
      setShowAddModal(false);
      setSearchProduct('');
    } catch (err) {
      toast.error('Error al agregar a vitrina: ' + err.message);
    }
  };

  const openSliceModal = (group) => {
    setSliceTarget({ ...group.oldestItem, product: group.product });
    setSliceCount('6');
    setSlicePrice(Math.round(group.product.price / 6).toString());
    setShowSliceModal(true);
  };

  const handleSlice = async () => {
    if (!sliceTarget) return;
    const count = parseInt(sliceCount);
    const price = parseInt(slicePrice);
    if (isNaN(count) || count < 2) { toast.error('Mínimo 2 trozos'); return; }
    if (isNaN(price) || price <= 0) { toast.error('El precio por trozo debe ser mayor a 0'); return; }
    try {
      const now = new Date().toISOString();
      await db.showcaseItems.update(sliceTarget.id, { status: 'sliced', removedAt: now });
      const slices = Array.from({ length: count }, () => ({
        productId: sliceTarget.productId,
        placedAt: sliceTarget.placedAt,
        removedAt: null,
        status: 'active',
        showcaseType: 'trozado',
        parentId: sliceTarget.id,
        slicedAt: now,
        slicePrice: price,
      }));
      await db.showcaseItems.bulkAdd(slices);
      toast.success(`${sliceTarget.product.name} trozado en ${count} porciones a ${formatCurrency(price)} c/u`);
      setShowSliceModal(false);
      setSliceTarget(null);
      setShowcaseTab('trozados');
    } catch (err) {
      toast.error('Error al trozar: ' + err.message);
    }
  };

  const openRemoveModal = (group) => {
    setRemoveGroup(group);
    setRemoveQty('1');
    setRemoveReason('Vencido');
    setShowRemoveModal(true);
  };

  const handleBatchRemove = async () => {
    if (!removeGroup) return;
    const qty = parseInt(removeQty);
    if (isNaN(qty) || qty <= 0 || qty > removeGroup.count) {
      toast.error(`Ingrese una cantidad entre 1 y ${removeGroup.count}`);
      return;
    }
    try {
      const now = new Date().toISOString();
      const itemsToRemove = removeGroup.items.slice(0, qty);
      for (const item of itemsToRemove) {
        await db.showcaseItems.update(item.id, { status: 'removed', removedAt: now, removeReason });
      }
      toast.success(`${qty}x ${removeGroup.product.name} retirado(s). Motivo: ${removeReason}`);
      setShowRemoveModal(false);
      setRemoveGroup(null);
    } catch (err) {
      toast.error('Error al retirar: ' + err.message);
    }
  };

  const openDetailModal = (group) => {
    setDetailGroup(group);
    setSelectedDetailItems([]);
    setRemoveDetailReason('Vencido');
    setShowDetailModal(true);
  };

  /** Retiro como merma: cuenta en estadísticas de waste */
  const handleRemoveSelected = async () => {
    if (selectedDetailItems.length === 0) return;
    try {
      const now = new Date().toISOString();
      for (const id of selectedDetailItems) {
        await db.showcaseItems.update(id, {
          status: 'removed',
          removedAt: now,
          removeReason: removeDetailReason,
        });
      }
      toast.success(`${selectedDetailItems.length} item(s) retirado(s) como merma. Motivo: ${removeDetailReason}`);
      setSelectedDetailItems([]);
      if (detailGroup && selectedDetailItems.length >= detailGroup.count) {
        setShowDetailModal(false);
        setDetailGroup(null);
      }
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  /**
   * Anulación de ingreso (admin only):
   * status 'cancelled' — NO cuenta como merma en ninguna estadística.
   * Usar cuando se ingresó el producto equivocado.
   */
  const handleCancelSelected = async () => {
    if (!isAdmin || selectedDetailItems.length === 0) return;
    try {
      const now = new Date().toISOString();
      for (const id of selectedDetailItems) {
        await db.showcaseItems.update(id, {
          status: 'cancelled',
          removedAt: now,
        });
      }
      await logAction(
        ACTIONS.SHOWCASE_CANCEL,
        currentSeller.id,
        `${selectedDetailItems.length}x ${detailGroup?.product.name} — ingreso anulado (corrección)`
      );
      toast.success(`${selectedDetailItems.length} ingreso(s) anulado(s). No contarán como merma.`);
      setSelectedDetailItems([]);
      if (detailGroup && selectedDetailItems.length >= detailGroup.count) {
        setShowDetailModal(false);
        setDetailGroup(null);
      }
    } catch (err) {
      toast.error('Error al anular: ' + err.message);
    }
  };

  /** Abrir modal de extensión de tiempo (admin only) */
  const openExtendModal = (group) => {
    setExtendTarget(group);
    setExtendHours(2);
    setShowExtendModal(true);
  };

  /**
   * Extensión de tiempo (admin only):
   * Suma extendedHours a todos los items del grupo.
   * Cap: no puede superar la duración original del producto.
   */
  const handleExtend = async () => {
    if (!extendTarget || !isAdmin) return;
    const hours = parseInt(extendHours) || 0;
    if (hours <= 0) { toast.error('Ingrese una cantidad válida de horas'); return; }

    const baseMaxH = extendTarget.product.maxShowcaseHours || 48;
    const currentExtra = extendTarget.oldestItem.extendedHours || 0;
    if (currentExtra + hours > baseMaxH) {
      toast.error(`Extensión máxima permitida: +${baseMaxH - currentExtra}h más`);
      return;
    }

    try {
      const newExtra = currentExtra + hours;
      for (const item of extendTarget.items) {
        await db.showcaseItems.update(item.id, { extendedHours: newExtra });
      }
      await logAction(
        ACTIONS.SHOWCASE_EXTEND,
        currentSeller.id,
        `${extendTarget.product.name}: +${hours}h (máx total ${baseMaxH + newExtra}h)`
      );
      toast.success(`⏱ Tiempo extendido +${hours}h para ${extendTarget.product.name}. Nuevo máximo: ${baseMaxH + newExtra}h`);
      setShowExtendModal(false);
      setExtendTarget(null);
    } catch (err) {
      toast.error('Error al extender: ' + err.message);
    }
  };

  // === Render ===

  const MOVEMENT_CONFIG = {
    added:     { label: 'Ingreso',          color: 'var(--color-success)',        emoji: '✅' },
    sliced:    { label: 'Trozado',           color: 'var(--color-info)',           emoji: '✂️' },
    sold:      { label: 'Vendido',           color: 'var(--color-primary)',        emoji: '🛒' },
    removed:   { label: 'Retirado (merma)', color: 'var(--color-danger)',         emoji: '🗑️' },
    cancelled: { label: 'Anulado',          color: 'var(--color-text-secondary)', emoji: '🔄' },
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Store size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Control de Vitrina
        </h1>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={18} /> Agregar a Vitrina
        </button>
      </div>

      {/* Alert: expired items */}
      {dangerCount > 0 && (
        <div className="alert-banner">
          <AlertTriangle className="icon" size={20} />
          <span>
            <strong>{dangerCount} producto(s)</strong> han superado su tiempo máximo en vitrina.
            Se recomienda retirarlos.
          </span>
        </div>
      )}

      {/* Alert: restock needed */}
      {restockNeeded.length > 0 && (
        <div className="alert-banner" style={{
          background: 'var(--color-info-bg)',
          borderColor: 'var(--color-info)',
          color: 'var(--color-info)',
          marginTop: dangerCount > 0 ? 'var(--space-sm)' : 0,
        }}>
          <RefreshCw size={20} />
          <span>
            <strong>Restock pendiente:</strong>{' '}
            {restockNeeded.map(p => p.name).join(', ')} — agotados en vitrina hoy.
          </span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon primary"><Store size={22} /></div>
          <div className="kpi-content">
            <div className="kpi-value">{allShowcaseItems.length}</div>
            <div className="kpi-label">Total en vitrina</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon primary"><Package size={22} /></div>
          <div className="kpi-content">
            <div className="kpi-value">{enteros.length}</div>
            <div className="kpi-label">Enteros</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon success"><Scissors size={22} /></div>
          <div className="kpi-content">
            <div className="kpi-value">{trozados.length}</div>
            <div className="kpi-label">Trozados</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon danger"><AlertTriangle size={22} /></div>
          <div className="kpi-content">
            <div className="kpi-value">{dangerCount}</div>
            <div className="kpi-label">Retirar urgente</div>
          </div>
        </div>
      </div>

      {/* Daily activity strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)',
      }}>
        {[
          { value: dailyStats.soldToday,  label: 'Vendidos hoy',   color: 'var(--color-success)', bg: 'var(--color-success-bg)', Icon: ShoppingCart },
          { value: dailyStats.mermaToday, label: 'Retirados hoy',  color: 'var(--color-danger)',  bg: 'var(--color-danger-bg)',  Icon: Trash2 },
          { value: dailyStats.addedToday, label: 'Ingresados hoy', color: 'var(--color-primary)', bg: 'var(--color-primary-bg)', Icon: Plus },
        ].map(({ value, label, color, bg, Icon }) => (
          <div key={label} style={{
            background: bg, border: `1px solid ${color}`,
            borderRadius: 'var(--radius-md)', padding: 'var(--space-md)',
            display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
          }}>
            <Icon size={20} color={color} />
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="showcase-tabs">
        <button
          className={`showcase-tab ${showcaseTab === 'enteros' ? 'active' : ''}`}
          onClick={() => setShowcaseTab('enteros')}
        >
          <Package size={16} /> Enteros ({enteros.length})
        </button>
        <button
          className={`showcase-tab ${showcaseTab === 'trozados' ? 'active' : ''}`}
          onClick={() => setShowcaseTab('trozados')}
        >
          <Scissors size={16} /> Trozados ({trozados.length})
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={15} style={{
            position: 'absolute', left: 11, top: '50%',
            transform: 'translateY(-50%)', color: 'var(--color-text-secondary)',
          }} />
          <input
            type="text" className="form-input"
            placeholder="Buscar producto en vitrina..."
            value={vitrineSearch}
            onChange={e => setVitrinaSearch(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>
        {vitrineSearch && (
          <button className="btn btn-ghost btn-sm" onClick={() => setVitrinaSearch('')}>Limpiar</button>
        )}
        {vitrineSearch && (
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
            {filteredGroups.length} resultado(s)
          </span>
        )}
      </div>

      {/* Showcase grid */}
      {filteredGroups.length === 0 ? (
        <div className="empty-state">
          <Store size={48} />
          <h3>
            {vitrineSearch
              ? `Sin resultados para "${vitrineSearch}"`
              : showcaseTab === 'enteros' ? 'Sin productos enteros' : 'Sin trozos en vitrina'}
          </h3>
          <p>
            {vitrineSearch ? 'Probá con otro nombre'
              : showcaseTab === 'enteros'
                ? 'Agrega productos para comenzar a trackear su frescura'
                : 'Troza un producto entero para crear porciones'}
          </p>
          {showcaseTab === 'enteros' && !vitrineSearch && (
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)} style={{ marginTop: 'var(--space-md)' }}>
              <Plus size={18} /> Agregar Producto
            </button>
          )}
        </div>
      ) : (
        <div className="showcase-grid">
          {filteredGroups.map(group => (
            <div key={group.productId} className={`showcase-group-card freshness-${group.freshnessStatus}`}>
              {/* Header */}
              <div className="group-card-header">
                {group.product?.photo ? (
                  <img src={group.product.photo} alt={group.product.name} className="group-product-photo" />
                ) : (
                  <div className="group-product-emoji">
                    {group.showcaseType === 'trozado' ? '🔪' : '🍰'}
                  </div>
                )}
                <div className="group-info">
                  <h3 className="group-product-name">{group.product.name}</h3>
                  <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="showcase-type-badge">
                      {group.showcaseType === 'trozado' ? '✂️ Trozado' : '🎂 Entero'}
                    </span>
                    {group.isExtended && (
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 700, padding: '1px 6px',
                        borderRadius: 4, background: 'var(--color-primary-bg)',
                        color: 'var(--color-primary)', border: '1px solid var(--color-primary)',
                      }}>
                        ⏱ +{group.extendedHours}h
                      </span>
                    )}
                  </div>
                </div>
                <span className={`semaphore semaphore-${group.freshnessStatus}`}></span>
              </div>

              {/* Quantity */}
              <div className="quantity-display">
                <div className="quantity-number">{group.count}</div>
                <div className="quantity-label">
                  {group.showcaseType === 'trozado' ? 'trozos disponibles' : 'unidades en vitrina'}
                </div>
              </div>

              {/* Freshness + time remaining */}
              <div className={`freshness-indicator freshness-${group.freshnessStatus}`}>
                <span className="freshness-icon">
                  {group.freshnessStatus === 'fresh' && '🟢'}
                  {group.freshnessStatus === 'warning' && '🟡'}
                  {group.freshnessStatus === 'danger' && '🔴'}
                </span>
                <span className="freshness-text">
                  {group.freshnessStatus === 'fresh' && 'Fresco'}
                  {group.freshnessStatus === 'warning' && 'Próximo a vencer'}
                  {group.freshnessStatus === 'danger' && 'RETIRAR'}
                </span>
                <span className="freshness-time" style={{ fontWeight: 600 }}>
                  {group.timeRemaining}
                </span>
              </div>

              {/* Progress bar */}
              <div style={{ background: 'rgba(0,0,0,0.08)', borderRadius: 4, height: 5, margin: '6px 0 4px' }}>
                <div style={{
                  width: `${group.freshnessPct}%`, height: '100%', borderRadius: 4,
                  background: group.freshnessStatus === 'fresh' ? 'var(--color-success)'
                    : group.freshnessStatus === 'warning' ? 'var(--color-warning)'
                    : 'var(--color-danger)',
                  transition: 'width 0.5s ease',
                }} />
              </div>

              {/* Actions */}
              <div className="group-card-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => openDetailModal(group)}>
                  <Eye size={14} /> Detalle ({group.count})
                </button>
                {group.showcaseType !== 'trozado' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => openSliceModal(group)}>
                    <Scissors size={14} /> Trozar
                  </button>
                )}
                {isAdmin && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => openExtendModal(group)}
                    title="Extender tiempo máximo en vitrina (solo admin)"
                    disabled={group.extendedHours >= group.baseMaxH}
                  >
                    <Clock size={14} /> Extender
                  </button>
                )}
                <button className="btn btn-danger btn-sm" onClick={() => openRemoveModal(group)}>
                  <Trash2 size={14} /> Retirar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Daily movements history */}
      <div style={{ marginTop: 'var(--space-xl)' }}>
        <button
          className="btn btn-ghost"
          style={{
            width: '100%', justifyContent: 'space-between',
            borderBottom: '1px solid var(--color-border)', borderRadius: 0, paddingLeft: 0,
          }}
          onClick={() => setShowHistory(h => !h)}
        >
          <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>
            <Clock size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Historial del día ({todayMovementsLog.length} movimiento{todayMovementsLog.length !== 1 ? 's' : ''})
          </span>
          {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showHistory && (
          <div style={{
            marginTop: 'var(--space-sm)',
            background: 'var(--color-bg-card)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            overflow: 'hidden',
          }}>
            {todayMovementsLog.length === 0 ? (
              <p style={{ padding: 'var(--space-lg)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                Sin movimientos registrados hoy
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                    {['Hora', 'Producto', 'Movimiento', 'Cant.', 'Motivo'].map(h => (
                      <th key={h} style={{
                        padding: '10px 14px', textAlign: h === 'Cant.' ? 'center' : 'left',
                        color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: '0.8rem',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {todayMovementsLog.map((entry, i) => {
                    const cfg = MOVEMENT_CONFIG[entry.type] || MOVEMENT_CONFIG.added;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '8px 14px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                          {format(new Date(entry.time), 'HH:mm')}
                        </td>
                        <td style={{ padding: '8px 14px', fontWeight: 500 }}>
                          {productMap[entry.productId]?.name || `ID ${entry.productId}`}
                        </td>
                        <td style={{ padding: '8px 14px' }}>
                          <span style={{ color: cfg.color, fontWeight: 500 }}>
                            {cfg.emoji} {cfg.label}
                          </span>
                        </td>
                        <td style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 700 }}>{entry.count}</td>
                        <td style={{ padding: '8px 14px', color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>
                          {entry.reason || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <AddModal
        show={showAddModal}
        filteredAvailable={filteredAvailable}
        searchProduct={searchProduct}
        onSearchChange={setSearchProduct}
        onAdd={addToShowcase}
        onClose={() => { setShowAddModal(false); setSearchProduct(''); }}
      />

      <SliceModal
        show={showSliceModal}
        sliceTarget={sliceTarget}
        sliceCount={sliceCount}
        slicePrice={slicePrice}
        onSliceCountChange={setSliceCount}
        onSlicePriceChange={setSlicePrice}
        onSlice={handleSlice}
        onClose={() => setShowSliceModal(false)}
      />

      <DetailModal
        show={showDetailModal}
        detailGroup={detailGroup}
        selectedItems={selectedDetailItems}
        removeDetailReason={removeDetailReason}
        onDetailReasonChange={setRemoveDetailReason}
        isAdmin={isAdmin}
        onToggleAll={checked => {
          if (checked) setSelectedDetailItems(detailGroup.items.map(i => i.id));
          else setSelectedDetailItems([]);
        }}
        onToggleItem={(id, checked) => {
          if (checked) setSelectedDetailItems(prev => [...prev, id]);
          else setSelectedDetailItems(prev => prev.filter(x => x !== id));
        }}
        onRemoveSelected={handleRemoveSelected}
        onCancelSelected={handleCancelSelected}
        onClose={() => { setShowDetailModal(false); setDetailGroup(null); }}
      />

      <RemoveModal
        show={showRemoveModal}
        removeGroup={removeGroup}
        removeQty={removeQty}
        removeReason={removeReason}
        onQtyChange={setRemoveQty}
        onReasonChange={setRemoveReason}
        onRemove={handleBatchRemove}
        onClose={() => setShowRemoveModal(false)}
      />

      <ExtendModal
        show={showExtendModal}
        extendTarget={extendTarget}
        extendHours={extendHours}
        onExtendHoursChange={setExtendHours}
        onExtend={handleExtend}
        onClose={() => setShowExtendModal(false)}
      />
    </div>
  );
}
