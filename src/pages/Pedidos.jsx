/**
 * Pedidos — Gestión de pedidos personalizados
 * V3.1: diseño mejorado, modal centrado
 */
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '../context/ToastContext';
import { useSeller } from '../context/SellerContext';
import api from '../utils/api';
import { formatCurrency, formatDate, formatShortDate } from '../utils/formatters';
import {
  ClipboardList, Plus, Phone, Calendar, ChevronLeft, ChevronRight,
  X, Edit, Search, Package, CheckCircle2, Clock, Truck, Star,
  ChevronDown, ChevronUp, ArrowRight, User, CreditCard, DollarSign,
} from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, addMonths, subMonths, getDay, isToday as checkIsToday
} from 'date-fns';
import { es } from 'date-fns/locale';
import DateInput from '../components/DateInput';

/* ── STATUS CONFIG ─────────────────────────────── */
const STATUS = {
  pendiente:     { label: 'Pendiente',        color: '#C8820A', bg: 'rgba(200,130,10,0.1)',  icon: Clock,         badge: 'badge-pending' },
  en_produccion: { label: 'En Producción',    color: '#2E7BBF', bg: 'rgba(46,123,191,0.1)', icon: Package,       badge: 'badge-production' },
  listo:         { label: 'Listo para Entregar', color: '#2E8B57', bg: 'rgba(46,139,87,0.1)',  icon: CheckCircle2,  badge: 'badge-ready' },
  entregado:     { label: 'Entregado',        color: '#7A6355', bg: 'rgba(122,99,85,0.1)',  icon: Truck,         badge: 'badge-delivered' },
};
const statusFlow = ['pendiente', 'en_produccion', 'listo', 'entregado'];

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.pendiente;
  const Icon = s.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 99,
      background: s.bg, color: s.color,
      fontSize: '0.78rem', fontWeight: 600,
    }}>
      <Icon size={12} />{s.label}
    </span>
  );
}

function StatusStepper({ current }) {
  const currentIdx = statusFlow.indexOf(current);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 'var(--space-sm)' }}>
      {statusFlow.map((s, i) => {
        const done    = i < currentIdx;
        const active  = i === currentIdx;
        const S       = STATUS[s];
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, flex: i < statusFlow.length - 1 ? 1 : 'unset' }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: done ? 'var(--color-success)' : active ? S.color : 'var(--color-border)',
              color: (done || active) ? '#fff' : 'var(--color-text-light)',
              fontSize: '0.65rem', fontWeight: 700,
              transition: 'all 0.2s',
            }}>
              {done ? '✓' : i + 1}
            </div>
            {i < statusFlow.length - 1 && (
              <div style={{
                flex: 1, height: 2, borderRadius: 1,
                background: done ? 'var(--color-success)' : 'var(--color-border)',
                transition: 'background 0.3s',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function isValidChileanPhone(phone) {
  if (!phone) return true;
  return /^(\+?56)?9\d{8}$/.test(phone.replace(/[\s\-()]/g, ''));
}

const emptyForm = { customer_name: '', phone: '', description: '', delivery_date: '', advance: '', balance: '' };

/* ── COMPONENT ─────────────────────────────────── */
export default function Pedidos() {
  const toast = useToast();
  const { currentSeller } = useSeller();

  const [orders, setOrders]             = useState([]);
  const [products, setProducts]         = useState([]);
  const [viewMode, setViewMode]         = useState('list');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch]             = useState('');
  const [showForm, setShowForm]         = useState(false);
  const [editingId, setEditingId]       = useState(null);
  const [form, setForm]                 = useState(emptyForm);
  const [orderItems, setOrderItems]     = useState([]);
  const [expandedId, setExpandedId]     = useState(null);
  const [payModal, setPayModal]         = useState(null);  // order a cobrar
  const [payMethod, setPayMethod]       = useState('efectivo');
  const [payLoading, setPayLoading]     = useState(false);

  const loadData = async () => {
    const [ords, prods] = await Promise.all([api.get('/orders'), api.get('/products')]);
    setOrders(ords);
    setProducts(prods.filter(p => p.active));
  };
  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    let list = orders;
    if (statusFilter) list = list.filter(o => o.status === statusFilter);
    if (search) {
      const t = search.toLowerCase();
      list = list.filter(o => o.customer_name.toLowerCase().includes(t) || o.phone?.includes(t));
    }
    return list;
  }, [orders, statusFilter, search]);

  const countByStatus = useMemo(() =>
    statusFlow.reduce((acc, s) => ({ ...acc, [s]: orders.filter(o => o.status === s).length }), {}),
    [orders]
  );

  const handleStatusChange = async (order, newStatus) => {
    if (newStatus === 'entregado') {
      setPayMethod('efectivo');
      setPayModal(order);
      return;
    }
    try {
      await api.patch(`/orders/${order.id}`, { status: newStatus });
      toast.success(`Pedido → ${STATUS[newStatus].label}`);
      loadData();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  const handleComplete = async () => {
    if (!payModal) return;
    setPayLoading(true);
    try {
      await api.post(`/orders/${payModal.id}/complete`, { payment_method: payMethod });
      toast.success(`Pedido entregado y venta registrada`);
      setPayModal(null);
      loadData();
    } catch (err) {
      toast.error('Error: ' + err.message);
    } finally {
      setPayLoading(false);
    }
  };

  const openEdit = (order) => {
    setEditingId(order.id);
    setForm({
      customer_name: order.customer_name,
      phone:         order.phone || '',
      description:   order.description || '',
      delivery_date: order.delivery_date ? order.delivery_date.split('T')[0] : '',
      advance:       String(order.advance || ''),
      balance:       String(order.balance || ''),
    });
    setOrderItems(order.items || []);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.customer_name.trim()) { toast.error('El nombre del cliente es obligatorio'); return; }
    if (form.phone && !isValidChileanPhone(form.phone)) { toast.error('Teléfono inválido (ej: +56 9 1234 5678)'); return; }

    const payload = {
      customer_name: form.customer_name,
      phone:         form.phone || null,
      description:   form.description || null,
      delivery_date: form.delivery_date ? new Date(form.delivery_date).toISOString() : null,
      advance:       parseFloat(form.advance) || 0,
      balance:       parseFloat(form.balance) || 0,
      items:         orderItems,
    };

    try {
      if (editingId) {
        await api.patch(`/orders/${editingId}`, payload);
        toast.success('Pedido actualizado');
      } else {
        await api.post('/orders', payload);
        toast.success('Pedido creado');
      }
      setShowForm(false); setEditingId(null); setForm(emptyForm); setOrderItems([]);
      loadData();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  const addOrderItem = (product) => {
    setOrderItems(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) return prev.map(i => i.product_id === product.id
        ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.price }
        : i);
      return [...prev, { product_id: product.id, product_name: product.name, price: product.price, quantity: 1, subtotal: product.price }];
    });
  };

  /* Calendar */
  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarMonth);
    const end   = endOfMonth(calendarMonth);
    return { days: eachDayOfInterval({ start, end }), startPad: getDay(start) };
  }, [calendarMonth]);

  const ordersWithDelivery = orders.filter(o => o.delivery_date && o.status !== 'entregado');
  const orderTotal         = (o) => (o.advance || 0) + (o.balance || 0);
  const itemsTotal         = orderItems.reduce((s, i) => s + i.subtotal, 0);

  /* ── RENDER ───────────────────────────────────── */
  return (
    <div>

      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">
          <ClipboardList size={26} style={{ verticalAlign: 'middle', marginRight: 10 }} />
          Pedidos
        </h1>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
          {/* Toggle vista */}
          <div style={{
            display: 'flex', background: 'rgba(229,221,210,0.45)',
            borderRadius: 'var(--radius-full)', padding: 3, gap: 2,
          }}>
            {[['list','Lista'],['calendar','Calendario']].map(([v, l]) => (
              <button key={v} onClick={() => setViewMode(v)} style={{
                padding: '5px 14px', border: 'none', borderRadius: 'var(--radius-full)',
                fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                background: viewMode === v ? 'var(--color-bg-card)' : 'transparent',
                color: viewMode === v ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
                boxShadow: viewMode === v ? 'var(--shadow-sm)' : 'none',
                transition: 'all var(--transition-fast)',
              }}>{l}</button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => { setEditingId(null); setForm(emptyForm); setOrderItems([]); setShowForm(true); }}>
            <Plus size={16} /> Nuevo Pedido
          </button>
        </div>
      </div>

      {/* Resumen rápido de estados */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 'var(--space-sm)',
        marginBottom: 'var(--space-lg)',
      }}>
        {statusFlow.map(s => {
          const S = STATUS[s];
          const Icon = S.icon;
          const count = countByStatus[s] || 0;
          const active = statusFilter === s;
          return (
            <button key={s} onClick={() => setStatusFilter(active ? '' : s)} style={{
              background: active ? S.bg : 'var(--color-bg-card)',
              border: `1.5px solid ${active ? S.color : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-lg)', padding: '12px var(--space-md)',
              cursor: 'pointer', textAlign: 'left', transition: 'all var(--transition-fast)',
              boxShadow: active ? `0 2px 10px ${S.bg}` : 'var(--shadow-sm)',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Icon size={15} style={{ color: S.color }} />
                <span style={{ fontSize: '1.3rem', fontWeight: 800, color: S.color }}>{count}</span>
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: active ? S.color : 'var(--color-text-secondary)' }}>
                {S.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── LISTA ─────────────────────────────────── */}
      {viewMode === 'list' && (
        <>
          {/* Barra búsqueda */}
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <div className="search-bar" style={{ maxWidth: 'unset' }}>
              <Search className="search-icon" size={15} />
              <input
                type="text" placeholder="Buscar por nombre o teléfono…"
                value={search} onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-light)', display: 'flex' }}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={{
              background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)', padding: 'var(--space-2xl)',
              textAlign: 'center', boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-md)' }}>
                <ClipboardList size={24} style={{ color: 'var(--color-text-light)' }} />
              </div>
              <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 600, marginBottom: 6 }}>Sin pedidos</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
                {search || statusFilter ? 'Ningún pedido coincide con los filtros.' : 'Aún no hay pedidos registrados.'}
              </p>
              {!search && !statusFilter && (
                <button className="btn btn-primary" onClick={() => { setForm(emptyForm); setOrderItems([]); setShowForm(true); }}>
                  <Plus size={15} /> Crear primer pedido
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {filtered.map(order => {
                const S         = STATUS[order.status] || STATUS.pendiente;
                const isExpanded = expandedId === order.id;
                const nextStatus = statusFlow[statusFlow.indexOf(order.status) + 1];
                return (
                  <div key={order.id} style={{
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    borderLeft: `3px solid ${S.color}`,
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-sm)',
                    overflow: 'hidden',
                    transition: 'box-shadow var(--transition-fast)',
                  }}>

                    {/* Cabecera de la card */}
                    <div
                      style={{ padding: 'var(--space-md) var(--space-lg)', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-md)' }}
                      onClick={() => setExpandedId(isExpanded ? null : order.id)}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                        background: S.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: S.color, fontWeight: 700, fontSize: '1rem',
                      }}>
                        {order.customer_name.charAt(0).toUpperCase()}
                      </div>

                      {/* Info principal */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{order.customer_name}</span>
                          <StatusBadge status={order.status} />
                          {order.delivery_date && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                              <Calendar size={11} />
                              {formatShortDate(order.delivery_date)}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-md)', fontSize: '0.8rem', color: 'var(--color-text-secondary)', flexWrap: 'wrap' }}>
                          {order.phone && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Phone size={11} />{order.phone}
                            </span>
                          )}
                          {order.items?.length > 0 && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Package size={11} />{order.items.length} producto{order.items.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Total + chevron */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexShrink: 0 }}>
                        {orderTotal(order) > 0 && (
                          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-text)' }}>
                            {formatCurrency(orderTotal(order))}
                          </span>
                        )}
                        <div style={{ color: 'var(--color-text-light)', transition: 'transform var(--transition-fast)', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                          <ChevronDown size={18} />
                        </div>
                      </div>
                    </div>

                    {/* Detalle expandido */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>

                        {/* Barra de progreso */}
                        <div style={{ padding: 'var(--space-md) var(--space-lg) var(--space-sm)' }}>
                          <StatusStepper current={order.status} />
                        </div>

                        {/* Descripción */}
                        {order.description && (
                          <div style={{ padding: '0 var(--space-lg) var(--space-md)', fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                            "{order.description}"
                          </div>
                        )}

                        {/* Items del pedido */}
                        {order.items?.length > 0 && (
                          <div style={{ margin: '0 var(--space-lg) var(--space-md)', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                            {order.items.map((item, idx) => (
                              <div key={item.id} style={{
                                display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
                                padding: '8px var(--space-md)',
                                borderBottom: idx < order.items.length - 1 ? '1px solid rgba(229,221,210,0.5)' : 'none',
                              }}>
                                <div style={{ width: 24, height: 24, borderRadius: 'var(--radius-sm)', background: 'var(--color-primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-primary)', flexShrink: 0 }}>
                                  {item.quantity}×
                                </div>
                                <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 500 }}>{item.product_name}</span>
                                <span style={{ fontSize: '0.875rem', fontWeight: 700 }}>{formatCurrency(item.subtotal)}</span>
                              </div>
                            ))}
                            {/* Desglose pago */}
                            {(order.advance > 0 || order.balance > 0) && (
                              <div style={{ padding: '8px var(--space-md)', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg)', display: 'flex', gap: 'var(--space-xl)', fontSize: '0.8rem' }}>
                                {order.advance > 0 && <span style={{ color: 'var(--color-success)' }}>✓ Anticipo: <strong>{formatCurrency(order.advance)}</strong></span>}
                                {order.balance > 0 && <span style={{ color: 'var(--color-warning)' }}>Saldo: <strong>{formatCurrency(order.balance)}</strong></span>}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Acciones */}
                        <div style={{ display: 'flex', gap: 'var(--space-sm)', padding: 'var(--space-md) var(--space-lg)', flexWrap: 'wrap', alignItems: 'center' }}>
                          {nextStatus && order.status !== 'entregado' && (
                            <button className="btn btn-primary btn-sm" onClick={() => handleStatusChange(order, nextStatus)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <ArrowRight size={13} /> Pasar a {STATUS[nextStatus].label}
                            </button>
                          )}
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(order)}>
                            <Edit size={13} /> Editar
                          </button>
                          {order.status === 'entregado' && (
                            <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <CheckCircle2 size={13} /> Entregado el {formatDate(order.updated_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── CALENDARIO ────────────────────────────── */}
      {viewMode === 'calendar' && (
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          {/* Nav mes */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}><ChevronLeft size={16} /></button>
            <h3 style={{ fontFamily: 'var(--font-heading)', textTransform: 'capitalize', fontSize: '1.1rem' }}>
              {format(calendarMonth, 'MMMM yyyy', { locale: es })}
            </h3>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}><ChevronRight size={16} /></button>
          </div>

          {/* Días semana */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--color-border)' }}>
            {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(d => (
              <div key={d} style={{ padding: '8px 4px', textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{d}</div>
            ))}
          </div>

          {/* Grilla días */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {Array.from({ length: calendarDays.startPad }).map((_, i) => (
              <div key={`pad-${i}`} style={{ minHeight: 72, borderRight: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }} />
            ))}
            {calendarDays.days.map((day, idx) => {
              const dayOrders = ordersWithDelivery.filter(o => isSameDay(new Date(o.delivery_date), day));
              const isToday   = checkIsToday(day);
              const col       = (calendarDays.startPad + idx) % 7;
              return (
                <div key={day.toISOString()} style={{
                  minHeight: 72, padding: 6,
                  borderRight: col < 6 ? '1px solid var(--color-border)' : 'none',
                  borderBottom: '1px solid var(--color-border)',
                  background: isToday ? 'rgba(191,90,47,0.04)' : 'transparent',
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', marginBottom: 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.8rem', fontWeight: isToday ? 800 : 500,
                    background: isToday ? 'var(--color-primary)' : 'transparent',
                    color: isToday ? '#fff' : 'var(--color-text)',
                  }}>{format(day, 'd')}</div>
                  {dayOrders.map(o => (
                    <div key={o.id} style={{
                      fontSize: '0.68rem', fontWeight: 600,
                      background: STATUS[o.status]?.bg || 'var(--color-primary-bg)',
                      color: STATUS[o.status]?.color || 'var(--color-primary)',
                      borderRadius: 4, padding: '2px 5px', marginBottom: 2,
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      cursor: 'pointer',
                    }} title={o.customer_name}
                      onClick={() => { setViewMode('list'); setExpandedId(o.id); }}
                    >
                      {o.customer_name}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── MODAL CREAR/EDITAR ─────────────────────── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--color-primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ClipboardList size={18} style={{ color: 'var(--color-primary)' }} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1rem', marginBottom: 1 }}>{editingId ? 'Editar Pedido' : 'Nuevo Pedido'}</h2>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                    {editingId ? 'Modifica los datos del pedido' : 'Completa los datos del cliente y el pedido'}
                  </div>
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>

              {/* Sección cliente */}
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <User size={12} /> Cliente
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Nombre *</label>
                    <input className="form-input" placeholder="Nombre del cliente" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} autoFocus />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Teléfono</label>
                    <input className="form-input" placeholder="+56 9 1234 5678" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Sección pedido */}
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ClipboardList size={12} /> Detalle del Pedido
                </div>
                <div className="form-group" style={{ marginBottom: 'var(--space-sm)' }}>
                  <label className="form-label">Descripción</label>
                  <textarea className="form-input" rows={2} placeholder="Ej: Torta de cumpleaños 3 pisos, decoración flores…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-sm)' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Fecha entrega</label>
                    <DateInput className="form-input" value={form.delivery_date} onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Anticipo ($)</label>
                    <input className="form-input" type="number" min="0" placeholder="0" value={form.advance} onChange={e => setForm(f => ({ ...f, advance: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Saldo ($)</label>
                    <input className="form-input" type="number" min="0" placeholder="0" value={form.balance} onChange={e => setForm(f => ({ ...f, balance: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Sección productos */}
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Package size={12} /> Productos
                </div>
                <select className="form-input" style={{ marginBottom: 'var(--space-sm)' }}
                  onChange={e => {
                    const p = products.find(x => x.id === parseInt(e.target.value));
                    if (p) addOrderItem(p);
                    e.target.value = '';
                  }}>
                  <option value="">+ Agregar producto al pedido…</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} — {formatCurrency(p.price)}</option>)}
                </select>

                {orderItems.length > 0 ? (
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    {orderItems.map((item, idx) => (
                      <div key={idx} style={{
                        display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
                        padding: '9px var(--space-md)',
                        borderBottom: idx < orderItems.length - 1 ? '1px solid rgba(229,221,210,0.5)' : 'none',
                        background: 'var(--color-bg-card)',
                      }}>
                        <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 500 }}>{item.product_name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '2px 4px' }}>
                          <button style={{ width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => setOrderItems(p => p.map((i, j) => j !== idx ? i : { ...i, quantity: Math.max(1, i.quantity - 1), subtotal: Math.max(1, i.quantity - 1) * i.price }))}>
                            −
                          </button>
                          <span style={{ minWidth: 22, textAlign: 'center', fontWeight: 700, fontSize: '0.9rem' }}>{item.quantity}</span>
                          <button style={{ width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => setOrderItems(p => p.map((i, j) => j !== idx ? i : { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.price }))}>
                            +
                          </button>
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', minWidth: 70, textAlign: 'right' }}>{formatCurrency(item.subtotal)}</span>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-light)', padding: 4, borderRadius: 4, display: 'flex' }}
                          onClick={() => setOrderItems(p => p.filter((_, j) => j !== idx))}>
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    {/* Total productos */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px var(--space-md)', background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)', fontSize: '0.875rem', fontWeight: 700 }}>
                      Total productos: {formatCurrency(itemsTotal)}
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 'var(--space-md)', color: 'var(--color-text-light)', fontSize: '0.82rem', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                    Sin productos agregados
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={!form.customer_name.trim()}>
                {editingId ? 'Guardar cambios' : 'Crear Pedido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: COBRAR PEDIDO ────────────────────── */}
      {payModal && (() => {
        const itemsTotal    = payModal.items?.reduce((s, i) => s + i.subtotal, 0) || 0;
        const explicitTotal = (payModal.advance || 0) + (payModal.balance || 0);
        const totalFinal    = explicitTotal > 0 ? explicitTotal : itemsTotal;
        return (
        <div className="modal-overlay" onClick={() => !payLoading && setPayModal(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'rgba(46,139,87,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Truck size={18} style={{ color: '#2E8B57' }} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1rem' }}>Cobrar y Entregar</h2>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 1 }}>
                    {payModal.customer_name}
                  </div>
                </div>
              </div>
              <button className="modal-close" onClick={() => setPayModal(null)} disabled={payLoading}><X size={18} /></button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>

              {/* Resumen del monto */}
              <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {itemsTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Productos</span>
                    <span style={{ fontWeight: 600 }}>{formatCurrency(itemsTotal)}</span>
                  </div>
                )}
                {payModal.advance > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Anticipo pagado</span>
                    <span style={{ color: '#2E8B57', fontWeight: 600 }}>− {formatCurrency(payModal.advance)}</span>
                  </div>
                )}
                {payModal.balance > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Saldo pendiente</span>
                    <span style={{ color: '#C8820A', fontWeight: 600 }}>{formatCurrency(payModal.balance)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: 8, marginTop: 2 }}>
                  <span style={{ fontWeight: 700 }}>Total del pedido</span>
                  <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--color-primary)' }}>
                    {formatCurrency(totalFinal)}
                  </span>
                </div>
              </div>

              {/* Método de pago */}
              <div>
                <label className="form-label">Método de pago</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-xs)' }}>
                  {[
                    { value: 'efectivo',      label: 'Efectivo',      icon: '💵' },
                    { value: 'debito',        label: 'Débito',        icon: '💳' },
                    { value: 'transferencia', label: 'Transferencia', icon: '🏦' },
                    { value: 'credito',       label: 'Crédito',       icon: '💳' },
                  ].map(m => (
                    <button key={m.value}
                      onClick={() => setPayMethod(m.value)}
                      style={{
                        padding: '10px 8px', border: `1.5px solid ${payMethod === m.value ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        borderRadius: 'var(--radius-md)', background: payMethod === m.value ? 'var(--color-primary-bg)' : 'var(--color-bg-card)',
                        cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                        color: payMethod === m.value ? 'var(--color-primary)' : 'var(--color-text)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        transition: 'all 0.15s',
                      }}>
                      {m.icon} {m.label}
                    </button>
                  ))}
                </div>
              </div>

            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setPayModal(null)} disabled={payLoading}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleComplete} disabled={payLoading}>
                <CheckCircle2 size={15} />
                {payLoading ? 'Registrando…' : 'Cobrar y Entregar'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

    </div>
  );
}
