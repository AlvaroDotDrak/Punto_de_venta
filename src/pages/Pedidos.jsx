/**
 * Pedidos — Order management with product selector
 * 
 * Features:
 * - Order items from product catalog with auto-pricing
 * - Chilean phone validation (+56 9 XXXX XXXX)
 * - Future delivery date validation
 * - Status workflow: pendiente → en_produccion → listo → entregado
 * - Calendar view
 */
import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useToast } from '../context/ToastContext';
import { useSeller } from '../context/SellerContext';
import { formatCurrency, formatDate, formatShortDate } from '../utils/formatters';
import { logAction, ACTIONS } from '../utils/auditLog';
import { ClipboardList, Plus, Phone, Calendar, ChevronLeft, ChevronRight, X, Edit, User, Search, Package, Trash2, ShoppingCart, CreditCard, CheckCircle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay, isToday as checkIsToday, isPast } from 'date-fns';
import { es } from 'date-fns/locale';

const statusLabels = {
  pendiente: 'Pendiente',
  en_produccion: 'En Producción',
  listo: 'Listo para Entrega',
  entregado: 'Entregado',
};

const statusFlow = ['pendiente', 'en_produccion', 'listo', 'entregado'];

const emptyForm = {
  customerName: '',
  phone: '',
  description: '',
  deliveryDate: '',
  advance: '',
  totalPrice: '',
  notes: '',
};

// Chilean phone validation: +56 9 XXXX XXXX or 9XXXXXXXX
function isValidChileanPhone(phone) {
  if (!phone) return true; // Optional
  const cleaned = phone.replace(/[\s\-()]/g, '');
  return /^(\+?56)?9\d{8}$/.test(cleaned);
}

export default function Pedidos() {
  const toast = useToast();
  const { currentSeller } = useSeller();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [orderItems, setOrderItems] = useState([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState('list');

  // Payment modal state
  const [payingOrder, setPayingOrder] = useState(null);
  const [payMethod, setPayMethod] = useState('efectivo');
  const [amountReceived, setAmountReceived] = useState('');

  // Delete confirmation state
  const [deletingOrder, setDeletingOrder] = useState(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);

  // Load orders
  const orders = useLiveQuery(() => db.orders.reverse().toArray(), [], []);
  
  // Load products for selector
  const products = useLiveQuery(() => db.products.filter(p => p.active !== false).toArray(), [], []);

  // Load order items for each order
  const allOrderItems = useLiveQuery(() => db.orderItems.toArray(), [], []);

  const orderItemsMap = useMemo(() => {
    const map = {};
    allOrderItems.forEach(item => {
      if (!map[item.orderId]) map[item.orderId] = [];
      map[item.orderId].push(item);
    });
    return map;
  }, [allOrderItems]);

  // Filter products for picker
  const filteredProducts = useMemo(() => {
    if (!productSearch) return products;
    const term = productSearch.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(term));
  }, [products, productSearch]);

  // Filter orders
  const filteredOrders = useMemo(() => {
    if (statusFilter === 'todos') return orders.filter(o => o.status !== 'entregado');
    return orders.filter(o => o.status === statusFilter);
  }, [orders, statusFilter]);

  // Calendar data
  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarMonth);
    const end = endOfMonth(calendarMonth);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start) === 0 ? 6 : getDay(start) - 1;
    const padStart = Array.from({ length: startDay }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() - startDay + i);
      return { date: d, otherMonth: true };
    });
    return [...padStart, ...days.map(d => ({ date: d, otherMonth: false }))];
  }, [calendarMonth]);

  const ordersByDate = useMemo(() => {
    const map = {};
    orders.filter(o => o.status !== 'entregado' && o.deliveryDate).forEach(order => {
      const key = format(new Date(order.deliveryDate), 'yyyy-MM-dd');
      if (!map[key]) map[key] = [];
      map[key].push(order);
    });
    return map;
  }, [orders]);

  // Order items management
  const addOrderItem = (product) => {
    setOrderItems(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        return prev.map(i => i.productId === product.id
          ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.price }
          : i
        );
      }
      return [...prev, {
        productId: product.id,
        productName: product.name,
        price: product.price,
        quantity: 1,
        subtotal: product.price,
      }];
    });
  };

  const updateItemQty = (productId, delta) => {
    setOrderItems(prev => prev.map(i => {
      if (i.productId !== productId) return i;
      const newQty = Math.max(0, i.quantity + delta);
      if (newQty === 0) return null;
      return { ...i, quantity: newQty, subtotal: newQty * i.price };
    }).filter(Boolean));
  };

  const removeOrderItem = (productId) => {
    setOrderItems(prev => prev.filter(i => i.productId !== productId));
  };

  const itemsTotal = orderItems.reduce((s, i) => s + i.subtotal, 0);

  // Auto-update total when items change
  const effectiveTotal = orderItems.length > 0 ? itemsTotal : parseInt(form.totalPrice) || 0;

  const openDeleteModal = (order) => {
    setDeletingOrder(order);
    setDeleteConfirmed(false);
  };

  const handleDeleteOrder = async () => {
    try {
      await db.orderItems.where('orderId').equals(deletingOrder.id).delete();
      await db.orders.delete(deletingOrder.id);
      await logAction(ACTIONS.ORDER_UPDATE, currentSeller?.id,
        `Pedido eliminado: ${deletingOrder.customerName}`);
      toast.success('Pedido eliminado');
      setDeletingOrder(null);
    } catch (err) {
      console.error('Error al eliminar pedido:', err);
      toast.error('Error al eliminar el pedido');
    }
  };

  const openPayModal = (order) => {
    setPayingOrder(order);
    setPayMethod('efectivo');
    setAmountReceived('');
  };

  const handleCobrarPedido = async () => {
    const order = payingOrder;
    const balance = order.balance || 0;
    const items = orderItemsMap[order.id] || [];

    try {
      const saleId = await db.sales.add({
        total: balance,
        paymentMethod: payMethod,
        sellerId: currentSeller?.id,
        createdAt: new Date().toISOString(),
        status: 'completed',
        orderId: order.id,
      });

      const saleItems = items.length > 0
        ? items.map(i => ({
            saleId,
            productId: i.productId || null,
            productName: i.productName,
            price: i.price,
            quantity: i.quantity,
            subtotal: i.subtotal,
            category: 'encargo',
          }))
        : [{
            saleId,
            productId: null,
            productName: order.description || `Pedido ${order.customerName}`,
            price: balance,
            quantity: 1,
            subtotal: balance,
            category: 'encargo',
          }];

      await db.saleItems.bulkAdd(saleItems);

      if (payMethod === 'efectivo' && balance > 0) {
        const openRegister = await db.cashRegister.where('status').equals('open').first();
        if (openRegister) {
          await db.cashMovements.add({
            registerId: openRegister.id,
            type: 'sale',
            amount: balance,
            description: `Pedido: ${order.customerName}`,
            paymentMethod: 'efectivo',
            saleId,
            createdAt: new Date().toISOString(),
          });
        }
      }

      await db.orders.update(order.id, {
        status: 'entregado',
        updatedAt: new Date().toISOString(),
      });

      await logAction(ACTIONS.ORDER_SALE, currentSeller?.id,
        `Pedido cobrado: ${order.customerName} – ${formatCurrency(balance)} (${payMethod})`);

      toast.success(`Pedido de ${order.customerName} cobrado y entregado`);
      setPayingOrder(null);
    } catch (err) {
      console.error('Error al cobrar pedido:', err);
      toast.error('Error al procesar el cobro: ' + err.message);
    }
  };

  const handleSubmit = async () => {
    if (!form.customerName.trim()) {
      toast.error('El nombre del cliente es obligatorio');
      return;
    }
    if (!form.description.trim() && orderItems.length === 0) {
      toast.error('Agrega una descripción o productos al pedido');
      return;
    }
    // Phone validation
    if (form.phone && !isValidChileanPhone(form.phone)) {
      toast.error('Formato de teléfono inválido. Use: +56 9 XXXX XXXX ó 9XXXXXXXX');
      return;
    }
    // Delivery date validation - must be future
    if (form.deliveryDate) {
      const deliveryTime = new Date(form.deliveryDate);
      if (deliveryTime < new Date()) {
        toast.error('La fecha de entrega debe ser en el futuro');
        return;
      }
    }

    const advance = parseInt(form.advance) || 0;
    const totalPrice = effectiveTotal;

    const orderData = {
      customerName: form.customerName.trim(),
      phone: form.phone || '',
      description: form.description || orderItems.map(i => `${i.quantity}x ${i.productName}`).join(', '),
      deliveryDate: form.deliveryDate || null,
      advance,
      balance: totalPrice - advance,
      totalPrice,
      notes: form.notes,
      status: 'pendiente',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      if (editingId) {
        await db.orders.update(editingId, { ...orderData, updatedAt: new Date().toISOString() });
        // Update order items
        await db.orderItems.where('orderId').equals(editingId).delete();
        if (orderItems.length > 0) {
          await db.orderItems.bulkAdd(orderItems.map(item => ({ ...item, orderId: editingId })));
        }
        toast.success('Pedido actualizado');
        await logAction(ACTIONS.ORDER_UPDATE, currentSeller?.id, `Pedido para ${form.customerName}`);
      } else {
        const orderId = await db.orders.add(orderData);
        if (orderItems.length > 0) {
          await db.orderItems.bulkAdd(orderItems.map(item => ({ ...item, orderId })));
        }
        toast.success('Pedido registrado exitosamente');
        await logAction(ACTIONS.ORDER_CREATE, currentSeller?.id, `Pedido para ${form.customerName} - ${formatCurrency(totalPrice)}`);
      }
      setShowForm(false);
      setForm(emptyForm);
      setOrderItems([]);
      setEditingId(null);
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const advanceStatus = async (order) => {
    const currentIdx = statusFlow.indexOf(order.status);
    if (currentIdx < statusFlow.length - 1) {
      const nextStatus = statusFlow[currentIdx + 1];
      await db.orders.update(order.id, { status: nextStatus, updatedAt: new Date().toISOString() });
      toast.success(`Pedido → ${statusLabels[nextStatus]}`);
    }
  };

  const editOrder = async (order) => {
    setForm({
      customerName: order.customerName,
      phone: order.phone || '',
      description: order.description,
      deliveryDate: order.deliveryDate ? format(new Date(order.deliveryDate), "yyyy-MM-dd'T'HH:mm") : '',
      advance: order.advance?.toString() || '',
      totalPrice: order.totalPrice?.toString() || '',
      notes: order.notes || '',
    });
    // Load order items
    const items = await db.orderItems.where('orderId').equals(order.id).toArray();
    setOrderItems(items.map(i => ({
      productId: i.productId,
      productName: i.productName,
      price: i.price,
      quantity: i.quantity,
      subtotal: i.subtotal,
    })));
    setEditingId(order.id);
    setShowForm(true);
  };

  const updateField = (field, value) => setForm(f => ({ ...f, [field]: value }));

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <ClipboardList size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Pedidos por Encargo
        </h1>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <div className="quick-filters">
            <button className={`quick-filter ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>
              Lista
            </button>
            <button className={`quick-filter ${viewMode === 'calendar' ? 'active' : ''}`} onClick={() => setViewMode('calendar')}>
              Calendario
            </button>
          </div>
          <button className="btn btn-primary" onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); setOrderItems([]); }}>
            <Plus size={18} /> Nuevo Pedido
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <>
          {/* Status filter tabs */}
          <div className="tabs">
            <button className={`tab ${statusFilter === 'todos' ? 'active' : ''}`} onClick={() => setStatusFilter('todos')}>
              Activos ({orders.filter(o => o.status !== 'entregado').length})
            </button>
            {statusFlow.map(status => (
              <button key={status} className={`tab ${statusFilter === status ? 'active' : ''}`} onClick={() => setStatusFilter(status)}>
                {statusLabels[status]} ({orders.filter(o => o.status === status).length})
              </button>
            ))}
          </div>

          {filteredOrders.length === 0 ? (
            <div className="empty-state">
              <ClipboardList size={48} />
              <h3>Sin pedidos</h3>
              <p>No hay pedidos {statusFilter !== 'todos' ? `con estado "${statusLabels[statusFilter]}"` : 'activos'}</p>
            </div>
          ) : (
            <div className="grid-auto">
              {filteredOrders.map(order => {
                const items = orderItemsMap[order.id] || [];
                return (
                  <div key={order.id} className="order-card">
                    <div className="order-card-header">
                      <span className="order-card-customer">
                        <User size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                        {order.customerName}
                      </span>
                      <span className={`badge badge-${order.status === 'pendiente' ? 'pending' : order.status === 'en_produccion' ? 'production' : order.status === 'listo' ? 'ready' : 'delivered'}`}>
                        {statusLabels[order.status]}
                      </span>
                    </div>

                    {/* Order items list */}
                    {items.length > 0 ? (
                      <div className="order-items-summary">
                        {items.map((item, i) => (
                          <div key={i} className="order-item-row">
                            <span>{item.quantity}x {item.productName}</span>
                            <span>{formatCurrency(item.subtotal)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="order-card-detail">
                        <ClipboardList size={14} />
                        {order.description}
                      </div>
                    )}
                    
                    {order.phone && (
                      <div className="order-card-detail">
                        <Phone size={14} /> {order.phone}
                      </div>
                    )}
                    
                    {order.deliveryDate && (
                      <div className="order-card-detail">
                        <Calendar size={14} />
                        Entrega: {formatDate(order.deliveryDate)}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 'var(--space-lg)', marginTop: 'var(--space-sm)', fontSize: '0.85rem' }}>
                      <div>
                        <span style={{ color: 'var(--color-text-secondary)' }}>Total: </span>
                        <strong>{formatCurrency(order.totalPrice || 0)}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-secondary)' }}>Anticipo: </span>
                        <strong>{formatCurrency(order.advance || 0)}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-secondary)' }}>Saldo: </span>
                        <strong style={{ color: order.balance > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                          {formatCurrency(order.balance || 0)}
                        </strong>
                      </div>
                    </div>

                    <div className="order-card-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => editOrder(order)}>
                        <Edit size={14} /> Editar
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => openDeleteModal(order)}
                        style={{ color: 'var(--color-danger)' }}
                        title="Eliminar pedido"
                      >
                        <Trash2 size={14} />
                      </button>
                      {order.status !== 'entregado' && (
                        <>
                          <button className="btn btn-primary btn-sm" onClick={() => advanceStatus(order)}>
                            → {statusLabels[statusFlow[statusFlow.indexOf(order.status) + 1]] || ''}
                          </button>
                          <button className="btn btn-success btn-sm" onClick={() => openPayModal(order)}>
                            <CreditCard size={14} /> Cobrar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Calendar View */
        <div className="calendar">
          <div className="calendar-header">
            <button className="btn btn-ghost btn-sm" onClick={() => setCalendarMonth(m => subMonths(m, 1))}>
              <ChevronLeft size={18} />
            </button>
            <h3 style={{ fontFamily: 'var(--font-body)' }}>
              {format(calendarMonth, 'MMMM yyyy', { locale: es })}
            </h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setCalendarMonth(m => addMonths(m, 1))}>
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="calendar-grid">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
              <div key={d} className="calendar-day-header">{d}</div>
            ))}
            {calendarDays.map(({ date, otherMonth }, i) => {
              const key = format(date, 'yyyy-MM-dd');
              const dayOrders = ordersByDate[key] || [];
              return (
                <div key={i} className={`calendar-day ${otherMonth ? 'other-month' : ''} ${checkIsToday(date) ? 'today' : ''}`}>
                  <div className="calendar-day-number">{format(date, 'd')}</div>
                  {dayOrders.map(order => (
                    <div key={order.id} className="calendar-event" title={order.description}>
                      {order.customerName}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {payingOrder && (() => {
        const balance = payingOrder.balance || 0;
        const items = orderItemsMap[payingOrder.id] || [];
        const received = parseInt(amountReceived) || 0;
        const change = payMethod === 'efectivo' && received >= balance ? received - balance : 0;
        const canConfirm = balance === 0 || payMethod !== 'efectivo' || received >= balance;

        return (
          <div className="modal-overlay" onClick={() => setPayingOrder(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2><CreditCard size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} />Cobrar Pedido</h2>
                <button className="modal-close" onClick={() => setPayingOrder(null)}><X size={20} /></button>
              </div>
              <div className="modal-body">
                {/* Order summary */}
                <div style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 'var(--space-xs)' }}>
                    <User size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    {payingOrder.customerName}
                  </div>
                  {items.length > 0 ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                      {items.map((i, idx) => (
                        <div key={idx}>{i.quantity}× {i.productName}</div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                      {payingOrder.description}
                    </div>
                  )}
                </div>

                {/* Amounts */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', marginBottom: 'var(--space-md)', fontSize: '0.9rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Total del pedido</span>
                    <span>{formatCurrency(payingOrder.totalPrice || 0)}</span>
                  </div>
                  {(payingOrder.advance || 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-text-secondary)' }}>Anticipo cobrado</span>
                      <span style={{ color: 'var(--color-success)' }}>– {formatCurrency(payingOrder.advance)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.05rem', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-xs)' }}>
                    <span>Saldo a cobrar</span>
                    <span style={{ color: balance > 0 ? 'var(--color-primary)' : 'var(--color-success)' }}>
                      {formatCurrency(balance)}
                    </span>
                  </div>
                </div>

                {balance === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', color: 'var(--color-success)', background: 'var(--color-success-bg, #f0fdf4)', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)' }}>
                    <CheckCircle size={16} />
                    Pedido pagado en su totalidad con anticipo
                  </div>
                ) : (
                  <>
                    {/* Payment method */}
                    <div className="form-group">
                      <label className="form-label">Método de pago</label>
                      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        {['efectivo', 'tarjeta', 'transferencia'].map(m => (
                          <button
                            key={m}
                            className={`btn btn-sm ${payMethod === m ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => { setPayMethod(m); setAmountReceived(''); }}
                            style={{ textTransform: 'capitalize', flex: 1 }}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Cash change */}
                    {payMethod === 'efectivo' && (
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Monto recibido</label>
                          <input
                            type="number"
                            className="form-input"
                            placeholder={balance}
                            value={amountReceived}
                            onChange={e => setAmountReceived(e.target.value)}
                            autoFocus
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Vuelto</label>
                          <div className="form-input" style={{ background: 'var(--color-bg)', fontWeight: 700, color: change > 0 ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
                            {formatCurrency(change)}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setPayingOrder(null)}>Cancelar</button>
                <button
                  className="btn btn-primary"
                  onClick={handleCobrarPedido}
                  disabled={!canConfirm}
                >
                  <CheckCircle size={16} />
                  {balance === 0 ? 'Marcar como entregado' : 'Confirmar cobro'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete Confirmation Modal */}
      {deletingOrder && (
        <div className="modal-overlay" onClick={() => setDeletingOrder(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ color: 'var(--color-danger)' }}>
                <Trash2 size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                Eliminar Pedido
              </h2>
              <button className="modal-close" onClick={() => setDeletingOrder(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 'var(--space-md)' }}>
                Vas a eliminar permanentemente el pedido de{' '}
                <strong>{deletingOrder.customerName}</strong>
                {deletingOrder.deliveryDate && (
                  <> con entrega el <strong>{formatDate(deletingOrder.deliveryDate)}</strong></>
                )}.
              </p>
              <div style={{
                background: 'var(--color-bg)',
                borderRadius: 'var(--radius-sm)',
                padding: 'var(--space-md)',
                marginBottom: 'var(--space-md)',
                fontSize: '0.85rem',
                color: 'var(--color-text-secondary)',
              }}>
                <div><strong>Total:</strong> {formatCurrency(deletingOrder.totalPrice || 0)}</div>
                {(deletingOrder.advance || 0) > 0 && (
                  <div><strong>Anticipo:</strong> {formatCurrency(deletingOrder.advance)}</div>
                )}
                <div><strong>Estado:</strong> {statusLabels[deletingOrder.status]}</div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={deleteConfirmed}
                  onChange={e => setDeleteConfirmed(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <span>Confirmo que quiero eliminar este pedido</span>
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeletingOrder(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={handleDeleteOrder}
                disabled={!deleteConfirmed}
              >
                <Trash2 size={16} /> Eliminar pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'Editar Pedido' : 'Nuevo Pedido'}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Nombre del Cliente *</label>
                  <input type="text" className="form-input" placeholder="Nombre..." value={form.customerName} onChange={e => updateField('customerName', e.target.value)} autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input type="tel" className="form-input" placeholder="+56 9 XXXX XXXX" value={form.phone} onChange={e => updateField('phone', e.target.value)} />
                  {form.phone && !isValidChileanPhone(form.phone) && (
                    <small style={{ color: 'var(--color-danger)', fontSize: '0.75rem' }}>
                      Formato inválido. Use: +56 9 XXXX XXXX
                    </small>
                  )}
                </div>
              </div>

              {/* Product Selector */}
              <div className="form-group">
                <label className="form-label">
                  <ShoppingCart size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  Productos del Pedido
                </label>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowProductPicker(!showProductPicker)}>
                  <Plus size={14} /> Agregar Producto
                </button>

                {showProductPicker && (
                  <div className="order-items-picker">
                    <div className="search-bar" style={{ maxWidth: '100%', marginBottom: 'var(--space-sm)' }}>
                      <Search className="search-icon" size={16} />
                      <input
                        type="text"
                        placeholder="Buscar producto..."
                        value={productSearch}
                        onChange={e => setProductSearch(e.target.value)}
                      />
                    </div>
                    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                      {filteredProducts.map(p => (
                        <div key={p.id} className="order-picker-item" onClick={() => addOrderItem(p)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                            {p.photo ? <img src={p.photo} alt="" className="product-thumb-sm" /> : null}
                            <span>{p.name}</span>
                          </div>
                          <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{formatCurrency(p.price)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Selected items */}
                {orderItems.length > 0 && (
                  <div className="order-items-list">
                    {orderItems.map(item => (
                      <div key={item.productId} className="order-item-row">
                        <span className="order-item-name">{item.productName}</span>
                        <div className="order-item-controls">
                          <button className="btn btn-ghost btn-sm" onClick={() => updateItemQty(item.productId, -1)}>−</button>
                          <span style={{ fontWeight: 600, minWidth: 24, textAlign: 'center' }}>{item.quantity}</span>
                          <button className="btn btn-ghost btn-sm" onClick={() => updateItemQty(item.productId, 1)}>+</button>
                        </div>
                        <span style={{ fontWeight: 600, minWidth: 70, textAlign: 'right' }}>{formatCurrency(item.subtotal)}</span>
                        <button className="btn btn-ghost btn-sm" onClick={() => removeOrderItem(item.productId)} style={{ color: 'var(--color-danger)' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <div className="order-items-total">
                      <span>Total productos:</span>
                      <strong>{formatCurrency(itemsTotal)}</strong>
                    </div>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Descripción / notas del pedido {orderItems.length === 0 ? '*' : ''}</label>
                <textarea className="form-textarea" placeholder="Ej: Torta de chocolate 3 pisos para 20 personas..." value={form.description} onChange={e => updateField('description', e.target.value)} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Fecha de entrega / retiro</label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.deliveryDate ? form.deliveryDate.slice(0, 10) : ''}
                    onChange={e => {
                      const datePart = e.target.value;
                      const timePart = form.deliveryDate ? form.deliveryDate.slice(11, 16) : '10:00';
                      updateField('deliveryDate', datePart ? `${datePart}T${timePart}` : '');
                    }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Hora de entrega / retiro</label>
                  <input
                    type="time"
                    className="form-input"
                    value={form.deliveryDate ? form.deliveryDate.slice(11, 16) : ''}
                    onChange={e => {
                      const timePart = e.target.value;
                      const datePart = form.deliveryDate
                        ? form.deliveryDate.slice(0, 10)
                        : format(new Date(), 'yyyy-MM-dd');
                      updateField('deliveryDate', timePart ? `${datePart}T${timePart}` : form.deliveryDate);
                    }}
                  />
                </div>
              </div>
              {form.deliveryDate && new Date(form.deliveryDate) < new Date() && (
                <small style={{ color: 'var(--color-danger)', fontSize: '0.75rem', display: 'block', marginTop: -8, marginBottom: 'var(--space-sm)' }}>
                  ⚠️ La fecha debe ser en el futuro
                </small>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Precio total</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="0"
                    value={orderItems.length > 0 ? itemsTotal : form.totalPrice}
                    onChange={e => updateField('totalPrice', e.target.value)}
                    disabled={orderItems.length > 0}
                  />
                  {orderItems.length > 0 && (
                    <small style={{ color: 'var(--color-text-light)', fontSize: '0.75rem' }}>
                      Calculado automáticamente desde los productos
                    </small>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Anticipo</label>
                  <input type="number" className="form-input" placeholder="0" value={form.advance} onChange={e => updateField('advance', e.target.value)} />
                </div>
              </div>
              {effectiveTotal > 0 && (
                <div style={{ padding: 'var(--space-sm)', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem' }}>
                  Saldo pendiente: <strong>{formatCurrency(effectiveTotal - (parseInt(form.advance) || 0))}</strong>
                </div>
              )}
              <div className="form-group" style={{ marginTop: 'var(--space-md)' }}>
                <label className="form-label">Notas adicionales</label>
                <textarea className="form-textarea" placeholder="Observaciones..." value={form.notes} onChange={e => updateField('notes', e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSubmit}>
                {editingId ? 'Actualizar Pedido' : 'Crear Pedido'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
