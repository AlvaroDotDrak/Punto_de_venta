/**
 * Pedidos — Gestión de pedidos personalizados
 * V3.0: consume FastAPI backend
 */
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '../context/ToastContext';
import { useSeller } from '../context/SellerContext';
import api from '../utils/api';
import { formatCurrency, formatDate, formatShortDate } from '../utils/formatters';
import { ClipboardList, Plus, Phone, Calendar, ChevronLeft, ChevronRight, X, Edit, Search, Trash2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay, isToday as checkIsToday } from 'date-fns';
import { es } from 'date-fns/locale';

const statusLabels = {
  pendiente: 'Pendiente',
  en_produccion: 'En Producción',
  listo: 'Listo para Entrega',
  entregado: 'Entregado',
};
const statusFlow = ['pendiente', 'en_produccion', 'listo', 'entregado'];
const statusColors = { pendiente: 'badge-warning', en_produccion: 'badge-info', listo: 'badge-fresh', entregado: 'badge-secondary' };

function isValidChileanPhone(phone) {
  if (!phone) return true;
  return /^(\+?56)?9\d{8}$/.test(phone.replace(/[\s\-()]/g, ''));
}

const emptyForm = { customer_name: '', phone: '', description: '', delivery_date: '', advance: '', balance: '' };

export default function Pedidos() {
  const toast = useToast();
  const { currentSeller } = useSeller();

  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [viewMode, setViewMode] = useState('list');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [orderItems, setOrderItems] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  const loadData = async () => {
    const [ords, prods] = await Promise.all([
      api.get('/orders'),
      api.get('/products'),
    ]);
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

  const handleStatusChange = async (order, newStatus) => {
    try {
      await api.patch(`/orders/${order.id}`, { status: newStatus });
      toast.success(`Pedido → ${statusLabels[newStatus]}`);
      loadData();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  const handleSubmit = async () => {
    if (!form.customer_name.trim()) { toast.error('El nombre del cliente es obligatorio'); return; }
    if (form.phone && !isValidChileanPhone(form.phone)) { toast.error('Teléfono inválido (ej: +56 9 1234 5678)'); return; }

    const payload = {
      customer_name: form.customer_name,
      phone: form.phone || null,
      description: form.description || null,
      delivery_date: form.delivery_date ? new Date(form.delivery_date).toISOString() : null,
      advance: parseFloat(form.advance) || 0,
      balance: parseFloat(form.balance) || 0,
      items: orderItems,
    };

    try {
      if (editingId) {
        await api.patch(`/orders/${editingId}`, payload);
        toast.success('Pedido actualizado');
      } else {
        await api.post('/orders', payload);
        toast.success('Pedido creado');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      setOrderItems([]);
      loadData();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  const addOrderItem = (product) => {
    setOrderItems(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.price } : i);
      return [...prev, { product_id: product.id, product_name: product.name, price: product.price, quantity: 1, subtotal: product.price }];
    });
  };

  // Calendar helpers
  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarMonth);
    const end = endOfMonth(calendarMonth);
    const days = eachDayOfInterval({ start, end });
    const startPad = getDay(start);
    return { days, startPad };
  }, [calendarMonth]);

  const ordersWithDelivery = orders.filter(o => o.delivery_date && o.status !== 'entregado');

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><ClipboardList size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />Pedidos</h1>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <div className="tabs">
            <button className={`tab ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>Lista</button>
            <button className={`tab ${viewMode === 'calendar' ? 'active' : ''}`} onClick={() => setViewMode('calendar')}>Calendario</button>
          </div>
          <button className="btn btn-primary" onClick={() => { setEditingId(null); setForm(emptyForm); setOrderItems([]); setShowForm(true); }}>
            <Plus size={16} /> Nuevo Pedido
          </button>
        </div>
      </div>

      {viewMode === 'list' && (
        <>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
            <div className="search-bar" style={{ flex: 1, minWidth: 180 }}>
              <Search className="search-icon" size={16} />
              <input type="text" placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="tabs">
              <button className={`tab ${!statusFilter ? 'active' : ''}`} onClick={() => setStatusFilter('')}>Todos</button>
              {statusFlow.map(s => (
                <button key={s} className={`tab ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>
                  {statusLabels[s]}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state"><ClipboardList size={48} /><h3>Sin pedidos</h3></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {filtered.map(order => (
                <div key={order.id} className="card">
                  <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}>
                    <div>
                      <strong>{order.customer_name}</strong>
                      {order.phone && <span style={{ marginLeft: 8, color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}><Phone size={12} /> {order.phone}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                      <span className={`badge ${statusColors[order.status] || 'badge-info'}`}>{statusLabels[order.status]}</span>
                      {order.delivery_date && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                          <Calendar size={12} /> {formatShortDate(order.delivery_date)}
                        </span>
                      )}
                      <span style={{ fontWeight: 600 }}>{formatCurrency((order.advance || 0) + (order.balance || 0))}</span>
                    </div>
                  </div>

                  {expandedId === order.id && (
                    <div style={{ padding: 'var(--space-md)', borderTop: '1px solid var(--color-border)' }}>
                      {order.description && <p style={{ marginBottom: 'var(--space-sm)', color: 'var(--color-text-secondary)' }}>{order.description}</p>}
                      {order.items?.length > 0 && (
                        <table style={{ width: '100%', fontSize: '0.875rem', marginBottom: 'var(--space-md)' }}>
                          <thead><tr><th>Producto</th><th>Cant.</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
                          <tbody>
                            {order.items.map(i => <tr key={i.id}><td>{i.product_name}</td><td>{i.quantity}</td><td style={{ textAlign: 'right' }}>{formatCurrency(i.subtotal)}</td></tr>)}
                          </tbody>
                        </table>
                      )}
                      <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                        {statusFlow.map((s, idx) => {
                          const currentIdx = statusFlow.indexOf(order.status);
                          if (s === order.status) return null;
                          if (idx !== currentIdx + 1) return null;
                          return (
                            <button key={s} className="btn btn-primary btn-sm" onClick={() => handleStatusChange(order, s)}>
                              → {statusLabels[s]}
                            </button>
                          );
                        })}
                        <button className="btn btn-ghost btn-sm" onClick={() => {
                          setEditingId(order.id);
                          setForm({ customer_name: order.customer_name, phone: order.phone || '', description: order.description || '', delivery_date: order.delivery_date ? order.delivery_date.split('T')[0] : '', advance: String(order.advance || ''), balance: String(order.balance || '') });
                          setOrderItems(order.items || []);
                          setShowForm(true);
                        }}><Edit size={14} /> Editar</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {viewMode === 'calendar' && (
        <div className="card">
          <div className="card-header">
            <button className="btn btn-ghost btn-sm" onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}><ChevronLeft size={16} /></button>
            <h3 style={{ textTransform: 'capitalize' }}>{format(calendarMonth, 'MMMM yyyy', { locale: es })}</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}><ChevronRight size={16} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, padding: 'var(--space-md)' }}>
            {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{d}</div>
            ))}
            {Array.from({ length: calendarDays.startPad }).map((_, i) => <div key={`pad-${i}`} />)}
            {calendarDays.days.map(day => {
              const dayOrders = ordersWithDelivery.filter(o => isSameDay(new Date(o.delivery_date), day));
              const isToday = checkIsToday(day);
              return (
                <div key={day.toISOString()} style={{ minHeight: 64, padding: 4, border: `1px solid ${isToday ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-sm)', background: isToday ? 'var(--color-primary-light, #f0f4ff)' : 'transparent' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: isToday ? 700 : 400 }}>{format(day, 'd')}</div>
                  {dayOrders.map(o => (
                    <div key={o.id} style={{ fontSize: '0.7rem', background: 'var(--color-primary)', color: '#fff', borderRadius: 2, padding: '1px 3px', marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {o.customer_name}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h2>{editingId ? 'Editar Pedido' : 'Nuevo Pedido'}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                <div className="form-group">
                  <label className="form-label">Cliente *</label>
                  <input className="form-input" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input className="form-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+56 9 1234 5678" />
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Descripción</label>
                  <textarea className="form-input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha entrega</label>
                  <input className="form-input" type="date" value={form.delivery_date} onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Anticipo</label>
                  <input className="form-input" type="number" min="0" value={form.advance} onChange={e => setForm(f => ({ ...f, advance: e.target.value }))} />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 'var(--space-md)' }}>
                <label className="form-label">Agregar productos</label>
                <select className="form-input" onChange={e => { const p = products.find(x => x.id === parseInt(e.target.value)); if (p) addOrderItem(p); e.target.value = ''; }}>
                  <option value="">Seleccionar producto...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} — {formatCurrency(p.price)}</option>)}
                </select>
              </div>

              {orderItems.length > 0 && (
                <table style={{ width: '100%', fontSize: '0.875rem' }}>
                  <thead><tr><th>Producto</th><th>Cant.</th><th style={{ textAlign: 'right' }}>Subtotal</th><th></th></tr></thead>
                  <tbody>
                    {orderItems.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.product_name}</td>
                        <td>
                          <input type="number" min="1" value={item.quantity} style={{ width: 60 }}
                            onChange={e => setOrderItems(prev => prev.map((i, j) => j !== idx ? i : { ...i, quantity: parseInt(e.target.value) || 1, subtotal: (parseInt(e.target.value) || 1) * i.price }))} />
                        </td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(item.subtotal)}</td>
                        <td><button className="btn btn-ghost btn-sm" onClick={() => setOrderItems(prev => prev.filter((_, j) => j !== idx))}><X size={12} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSubmit}>{editingId ? 'Guardar' : 'Crear Pedido'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
