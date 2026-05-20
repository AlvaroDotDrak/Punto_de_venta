/**
 * Insumos — Gestión de ingredientes y stock
 * V4.0: historial, modal unificado, filtros, ordenamiento
 */
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import {
  Package, Plus, Search, AlertTriangle, Edit, X,
  ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal,
  History, ChevronUp, ChevronDown, ChevronsUpDown, Filter,
} from 'lucide-react';

const UNITS = ['kg', 'gr', 'l', 'ml', 'unidad', 'docena'];

const CATEGORIES = [
  { value: 'reposteria',  label: 'Repostería' },
  { value: 'panaderia',   label: 'Panadería' },
  { value: 'lacteos',     label: 'Lácteos' },
  { value: 'frutas',      label: 'Frutas' },
  { value: 'packaging',   label: 'Packaging' },
  { value: 'limpieza',    label: 'Limpieza' },
  { value: 'otro',        label: 'Otro' },
];

const MOVEMENT_META = {
  purchase:   { label: 'Compra',   color: '#2E8B57', bg: 'rgba(46,139,87,0.1)',   icon: ArrowDownToLine },
  adjustment: { label: 'Ajuste',   color: '#2E7BBF', bg: 'rgba(46,123,191,0.1)', icon: SlidersHorizontal },
  usage:      { label: 'Consumo',  color: '#C8820A', bg: 'rgba(200,130,10,0.1)', icon: ArrowUpFromLine },
  loss:       { label: 'Merma',    color: '#C0392B', bg: 'rgba(192,57,43,0.1)',  icon: AlertTriangle },
};

const emptyForm = { name: '', unit: 'kg', current_stock: 0, min_stock: 0, last_price: 0, category: 'reposteria' };

function SortIcon({ field, sort }) {
  if (sort.field !== field) return <ChevronsUpDown size={13} style={{ opacity: 0.3, verticalAlign: 'middle', marginLeft: 3 }} />;
  return sort.dir === 'asc'
    ? <ChevronUp size={13} style={{ color: 'var(--color-primary)', verticalAlign: 'middle', marginLeft: 3 }} />
    : <ChevronDown size={13} style={{ color: 'var(--color-primary)', verticalAlign: 'middle', marginLeft: 3 }} />;
}

export default function Insumos() {
  const toast = useToast();

  const [ingredients, setIngredients]   = useState([]);
  const [search, setSearch]             = useState('');
  const [catFilter, setCatFilter]       = useState('todos');
  const [sort, setSort]                 = useState({ field: 'name', dir: 'asc' });

  const [showForm, setShowForm]         = useState(false);
  const [editingId, setEditingId]       = useState(null);
  const [form, setForm]                 = useState(emptyForm);

  const [showMovement, setShowMovement] = useState(null); // ingredient
  const [movType, setMovType]           = useState('purchase');
  const [movForm, setMovForm]           = useState({ quantity: '', cost: '', notes: '' });

  const [showHistory, setShowHistory]   = useState(null); // ingredient
  const [history, setHistory]           = useState([]);
  const [histLoading, setHistLoading]   = useState(false);

  const [activeTab, setActiveTab]       = useState('stock'); // 'stock' | 'history'
  const [globalHistory, setGlobalHistory] = useState([]);
  const [globalLoading, setGlobalLoading] = useState(false);

  const loadData = async () => {
    const data = await api.get('/ingredients').catch(() => []);
    setIngredients(data);
  };

  const loadGlobalHistory = async () => {
    setGlobalLoading(true);
    try {
      const data = await api.get('/ingredients/movements/global?limit=100');
      setGlobalHistory(data);
    } catch {
      toast.error('No se pudo cargar la bitácora global');
    } finally {
      setGlobalLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (activeTab === 'history') {
      loadGlobalHistory();
    }
  }, [activeTab]);

  // ── FILTRO + SORT ──────────────────────────────────────
  const displayed = useMemo(() => {
    let list = ingredients;
    if (catFilter !== 'todos') list = list.filter(i => i.category === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      let va, vb;
      if (sort.field === 'name')    { va = a.name; vb = b.name; }
      if (sort.field === 'stock')   { va = a.current_stock; vb = b.current_stock; }
      if (sort.field === 'status')  { va = a.current_stock <= a.min_stock ? 0 : 1; vb = b.current_stock <= b.min_stock ? 0 : 1; }
      if (typeof va === 'string') return sort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sort.dir === 'asc' ? va - vb : vb - va;
    });
  }, [ingredients, search, catFilter, sort]);

  const toggleSort = (field) => setSort(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' });

  const lowStock   = ingredients.filter(i => i.current_stock <= i.min_stock && i.min_stock > 0);
  const noStock    = ingredients.filter(i => i.current_stock === 0);
  const pricePerUnit = useMemo(() => {
    const q = parseFloat(movForm.quantity);
    const c = parseFloat(movForm.cost);
    if (!q || !c || q <= 0) return null;
    return c / q;
  }, [movForm.quantity, movForm.cost]);

  // ── HANDLERS ──────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    try {
      if (editingId) {
        await api.patch(`/ingredients/${editingId}`, form);
        toast.success('Insumo actualizado');
      } else {
        await api.post('/ingredients', form);
        toast.success('Insumo creado');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      loadData();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  const handleMovement = async () => {
    const qty = parseFloat(movForm.quantity);
    if (!qty || qty === 0) { toast.error('Ingresa una cantidad distinta de 0'); return; }

    if (movType === 'loss' && !movForm.notes?.trim()) {
      toast.error('Las mermas requieren una nota descriptiva');
      return;
    }

    // Para "usage" y "loss" el backend resta, así que siempre enviamos positivo
    // Para "adjustment" permitimos negativo (el backend suma, el signo hace el resto)
    const finalQty = (movType === 'usage' || movType === 'loss') ? Math.abs(qty) : qty;

    try {
      await api.post(`/ingredients/${showMovement.id}/movements`, {
        type: movType,
        quantity: finalQty,
        cost: movType === 'purchase' ? (parseFloat(movForm.cost) || null) : null,
        notes: movForm.notes?.trim() || null,
      });
      const labels = {
        purchase: 'Compra registrada',
        adjustment: 'Ajuste aplicado',
        usage: 'Consumo registrado',
        loss: 'Merma registrada'
      };
      toast.success(labels[movType]);
      setShowMovement(null);
      setMovForm({ quantity: '', cost: '', notes: '' });
      loadData();
      if (activeTab === 'history') {
        loadGlobalHistory();
      }
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  const openHistory = async (ing) => {
    setShowHistory(ing);
    setHistLoading(true);
    setHistory([]);
    try {
      const data = await api.get(`/ingredients/${ing.id}/movements`);
      setHistory(data);
    } catch { toast.error('No se pudo cargar el historial'); }
    finally { setHistLoading(false); }
  };

  // ── RENDER ────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">
          <Package size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Insumos
        </h1>
        <button className="btn btn-primary" onClick={() => { setEditingId(null); setForm(emptyForm); setShowForm(true); }}>
          <Plus size={16} /> Nuevo Insumo
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
        {[
          { label: 'Total',      value: ingredients.length, color: 'var(--color-text)' },
          { label: 'OK',         value: ingredients.length - lowStock.length, color: '#2E8B57' },
          { label: 'Stock bajo', value: lowStock.length,  color: '#C8820A' },
          { label: 'Sin stock',  value: noStock.length,   color: '#C0392B' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: s.color, lineHeight: 1.2 }}>{s.value}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Alerta stock bajo */}
      {lowStock.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 'var(--space-md)' }}>
          <AlertTriangle size={15} />
          <strong>{lowStock.length} insumo{lowStock.length > 1 ? 's' : ''} con stock bajo:</strong>{' '}
          {lowStock.map(i => i.name).join(', ')}
        </div>
      )}

      {/* Tabs de Navegación */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--space-md)' }}>
        <button
          onClick={() => setActiveTab('stock')}
          style={{
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'stock' ? '2.5px solid var(--color-primary)' : '2.5px solid transparent',
            color: activeTab === 'stock' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: '0.92rem',
            transition: 'all 0.2s'
          }}
        >
          <Package size={16} /> Lista de Insumos
        </button>
        <button
          onClick={() => setActiveTab('history')}
          style={{
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'history' ? '2.5px solid var(--color-primary)' : '2.5px solid transparent',
            color: activeTab === 'history' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: '0.92rem',
            transition: 'all 0.2s'
          }}
        >
          <History size={16} /> Historial de Bodega (Bitácora)
        </button>
      </div>

      {activeTab === 'stock' ? (
        <>
          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="search-bar" style={{ flex: 1, minWidth: 180 }}>
              <Search className="search-icon" size={15} />
              <input type="text" placeholder="Buscar insumo..." value={search} onChange={e => setSearch(e.target.value)} />
              {search && (
                <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-light)', display: 'flex' }}>
                  <X size={13} />
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button className={`btn btn-sm ${catFilter === 'todos' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setCatFilter('todos')}>
                <Filter size={12} /> Todos
              </button>
              {CATEGORIES.map(c => (
                <button key={c.value} className={`btn btn-sm ${catFilter === c.value ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setCatFilter(c.value)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tabla */}
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('name')}>
                    Nombre <SortIcon field="name" sort={sort} />
                  </th>
                  <th>Categoría</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('stock')}>
                    Stock actual <SortIcon field="stock" sort={sort} />
                  </th>
                  <th>Stock mínimo</th>
                  <th>Precio/unidad</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('status')}>
                    Estado <SortIcon field="status" sort={sort} />
                  </th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>Sin insumos{search || catFilter !== 'todos' ? ' que coincidan' : ''}</td></tr>
                ) : displayed.map(ing => {
                  const isLow    = ing.current_stock <= ing.min_stock && ing.min_stock > 0;
                  const isEmpty  = ing.current_stock === 0;
                  const catLabel = CATEGORIES.find(c => c.value === ing.category)?.label ?? ing.category;
                  return (
                    <tr key={ing.id} style={isLow ? { background: 'rgba(200, 130, 10, 0.02)' } : undefined}>
                      <td style={{ fontWeight: 600 }}>{ing.name}</td>
                      <td style={{ fontSize: '0.83rem', color: 'var(--color-text-secondary)' }}>{catLabel}</td>
                      <td style={{ fontWeight: 600, color: isEmpty ? '#C0392B' : isLow ? '#C8820A' : 'inherit' }}>
                        {ing.current_stock} {ing.unit}
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{ing.min_stock} {ing.unit}</td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {ing.last_price > 0 ? `${formatCurrency(ing.last_price)}/${ing.unit}` : <span style={{ color: 'var(--color-text-light)' }}>—</span>}
                      </td>
                      <td>
                        {isEmpty
                          ? <span className="badge badge-danger"><AlertTriangle size={11} /> Sin stock</span>
                          : isLow
                            ? <span className="badge badge-warning"><AlertTriangle size={11} /> Bajo</span>
                            : <span className="badge badge-fresh">OK</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button className="btn btn-ghost btn-sm" title="Editar" onClick={() => {
                            setEditingId(ing.id);
                            setForm({ name: ing.name, unit: ing.unit, current_stock: ing.current_stock, min_stock: ing.min_stock, last_price: ing.last_price, category: ing.category || 'reposteria' });
                            setShowForm(true);
                          }}><Edit size={14} /></button>
                          <button className="btn btn-ghost btn-sm" title="Historial" onClick={() => openHistory(ing)}>
                            <History size={14} />
                          </button>
                          <button className="btn btn-primary btn-sm" onClick={() => { setShowMovement(ing); setMovType('purchase'); setMovForm({ quantity: '', cost: '', notes: '' }); }}>
                            <ArrowDownToLine size={14} /> Movimiento
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        /* Historial de Bodega Global */
        <div>
          {globalLoading ? (
            <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Cargando bitácora…</div>
          ) : globalHistory.length === 0 ? (
            <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              <History size={32} style={{ opacity: 0.3, marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
              Sin movimientos registrados en la bodega
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Insumo</th>
                    <th>Tipo</th>
                    <th>Cantidad</th>
                    <th>Costo Total</th>
                    <th>Precio/u</th>
                    <th>Notas / Motivo</th>
                    <th>Operador</th>
                  </tr>
                </thead>
                <tbody>
                  {globalHistory.map(m => {
                    const meta = MOVEMENT_META[m.type] || MOVEMENT_META.adjustment;
                    const Icon = meta.icon;
                    const priceU = m.cost && m.quantity ? m.cost / m.quantity : null;
                    const sign = (m.type === 'usage' || m.type === 'loss') ? '−' : m.quantity < 0 ? '−' : '+';
                    const signColor = (m.type === 'usage' || m.type === 'loss') || m.quantity < 0 ? '#C0392B' : '#2E8B57';
                    return (
                      <tr key={m.id}>
                        <td style={{ fontSize: '0.83rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{formatDate(m.created_at)}</td>
                        <td style={{ fontWeight: 600 }}>{m.ingredient_name || `Insumo #${m.ingredient_id}`}</td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 99, background: meta.bg, color: meta.color, fontSize: '0.78rem', fontWeight: 600 }}>
                            <Icon size={11} />{meta.label}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: signColor }}>
                          {sign}{Math.abs(m.quantity)} {m.ingredient_unit}
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>
                          {m.cost ? formatCurrency(m.cost) : <span style={{ color: 'var(--color-text-light)' }}>—</span>}
                        </td>
                        <td style={{ fontSize: '0.83rem', color: 'var(--color-text-secondary)' }}>
                          {priceU ? `${formatCurrency(priceU)}/${m.ingredient_unit}` : <span style={{ color: 'var(--color-text-light)' }}>—</span>}
                        </td>
                        <td style={{ fontSize: '0.83rem', color: 'var(--color-text-secondary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.notes}>
                          {m.notes || <span style={{ color: 'var(--color-text-light)', fontStyle: 'italic' }}>—</span>}
                        </td>
                        <td style={{ fontSize: '0.83rem', color: 'var(--color-text-secondary)' }}>
                          {m.seller?.name ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: CREAR / EDITAR ───────────────────────── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'Editar Insumo' : 'Nuevo Insumo'}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Unidad</label>
                  <select className="form-input" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Categoría</label>
                  <select className="form-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Stock inicial</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={form.current_stock} onChange={e => setForm(f => ({ ...f, current_stock: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Stock mínimo</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={form.min_stock} onChange={e => setForm(f => ({ ...f, min_stock: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSubmit}>{editingId ? 'Guardar' : 'Crear'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: MOVIMIENTO ───────────────────────────── */}
      {showMovement && (
        <div className="modal-overlay" onClick={() => setShowMovement(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize: '1rem' }}>{showMovement.name}</h2>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  Stock actual: <strong>{showMovement.current_stock} {showMovement.unit}</strong>
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowMovement(null)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>

              {/* Tipo de movimiento */}
              <div>
                <label className="form-label">Tipo de movimiento</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 'var(--space-xs)' }}>
                  {[
                    { type: 'purchase',   label: 'Compra',  Icon: ArrowDownToLine,  desc: 'Suma stock' },
                    { type: 'adjustment', label: 'Ajuste',  Icon: SlidersHorizontal, desc: 'Corrección' },
                    { type: 'usage',      label: 'Consumo', Icon: ArrowUpFromLine,   desc: 'Resta stock' },
                    { type: 'loss',       label: 'Merma',    Icon: AlertTriangle,     desc: 'Descarte' },
                  ].map(({ type, label, Icon, desc }) => {
                    const meta = MOVEMENT_META[type];
                    const active = movType === type;
                    return (
                      <button key={type} onClick={() => { setMovType(type); setMovForm({ quantity: '', cost: '', notes: '' }); }}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                          padding: '10px 4px', border: `1.5px solid ${active ? meta.color : 'var(--color-border)'}`,
                          borderRadius: 'var(--radius-md)', background: active ? meta.bg : 'var(--color-bg-card)',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}>
                        <Icon size={16} style={{ color: meta.color }} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: active ? meta.color : 'var(--color-text)' }}>{label}</span>
                        <span style={{ fontSize: '0.62rem', color: 'var(--color-text-light)', textAlign: 'center' }}>{desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cantidad */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">
                  Cantidad ({showMovement.unit}) *
                  {movType === 'adjustment' && <span style={{ fontWeight: 400, color: 'var(--color-text-light)', marginLeft: 6, fontSize: '0.78rem' }}>negativo para reducir</span>}
                </label>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  min={movType === 'usage' || movType === 'loss' ? '0.01' : undefined}
                  placeholder={movType === 'adjustment' ? 'ej: 5 o -2' : '0.00'}
                  value={movForm.quantity}
                  onChange={e => setMovForm(f => ({ ...f, quantity: e.target.value }))}
                  autoFocus
                />
              </div>

              {/* Costo (solo compra) */}
              {movType === 'purchase' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Costo total (opcional)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    placeholder="$0"
                    value={movForm.cost}
                    onChange={e => setMovForm(f => ({ ...f, cost: e.target.value }))}
                  />
                  {pricePerUnit && (
                    <div style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      Precio unitario: <strong style={{ color: 'var(--color-text)' }}>{formatCurrency(pricePerUnit)}/{showMovement.unit}</strong>
                    </div>
                  )}
                </div>
              )}

              {/* Notas / Motivo (Obligatorio para mermas, opcional para otros) */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">
                  Motivo / Notas {movType === 'loss' ? '*' : '(opcional)'}
                </label>
                <input
                  className="form-input"
                  type="text"
                  placeholder={movType === 'loss' ? 'ej: Huevo roto al armar alfajores' : 'ej: Ajuste de inventario mensual'}
                  value={movForm.notes}
                  onChange={e => setMovForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowMovement(null)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={handleMovement}
                disabled={!movForm.quantity || parseFloat(movForm.quantity) === 0 || (movType === 'loss' && !movForm.notes?.trim())}
              >
                {movType === 'purchase' ? <ArrowDownToLine size={14} /> : (movType === 'usage' || movType === 'loss') ? <ArrowUpFromLine size={14} /> : <SlidersHorizontal size={14} />}
                {MOVEMENT_META[movType].label}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: HISTORIAL INDIVIDUAL ─────────────────── */}
      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <History size={18} style={{ color: 'var(--color-primary)' }} />
                <div>
                  <h2 style={{ fontSize: '1rem' }}>Historial — {showHistory.name}</h2>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 1 }}>
                    Stock actual: <strong>{showHistory.current_stock} {showHistory.unit}</strong>
                  </div>
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowHistory(null)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              {histLoading ? (
                <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Cargando…</div>
              ) : history.length === 0 ? (
                <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  <History size={32} style={{ opacity: 0.3, marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
                  Sin movimientos registrados
                </div>
              ) : (
                <div className="table-wrapper" style={{ margin: 0, borderRadius: 0, boxShadow: 'none' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Tipo</th>
                        <th>Cantidad</th>
                        <th>Costo</th>
                        <th>Precio/u</th>
                        <th>Notas / Motivo</th>
                        <th>Vendedor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map(m => {
                        const meta = MOVEMENT_META[m.type] || MOVEMENT_META.adjustment;
                        const Icon = meta.icon;
                        const priceU = m.cost && m.quantity ? m.cost / m.quantity : null;
                        const sign = (m.type === 'usage' || m.type === 'loss') ? '−' : m.quantity < 0 ? '−' : '+';
                        const signColor = (m.type === 'usage' || m.type === 'loss') || m.quantity < 0 ? '#C0392B' : '#2E8B57';
                        return (
                          <tr key={m.id}>
                            <td style={{ fontSize: '0.83rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{formatDate(m.created_at)}</td>
                            <td>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 99, background: meta.bg, color: meta.color, fontSize: '0.78rem', fontWeight: 600 }}>
                                <Icon size={11} />{meta.label}
                              </span>
                            </td>
                            <td style={{ fontWeight: 700, color: signColor }}>
                              {sign}{Math.abs(m.quantity)} {showHistory.unit}
                            </td>
                            <td style={{ fontSize: '0.85rem' }}>
                              {m.cost ? formatCurrency(m.cost) : <span style={{ color: 'var(--color-text-light)' }}>—</span>}
                            </td>
                            <td style={{ fontSize: '0.83rem', color: 'var(--color-text-secondary)' }}>
                              {priceU ? `${formatCurrency(priceU)}/${showHistory.unit}` : <span style={{ color: 'var(--color-text-light)' }}>—</span>}
                            </td>
                            <td style={{ fontSize: '0.83rem', color: 'var(--color-text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.notes}>
                              {m.notes || <span style={{ color: 'var(--color-text-light)', fontStyle: 'italic' }}>—</span>}
                            </td>
                            <td style={{ fontSize: '0.83rem', color: 'var(--color-text-secondary)' }}>
                              {m.seller?.name ?? '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowHistory(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
