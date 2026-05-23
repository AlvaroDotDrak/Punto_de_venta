/**
 * HistorialVentas — Historial de ventas con filtros y anulación
 * V3.1: diseño mejorado
 */
import { useState, useEffect, useMemo, Fragment } from 'react';
import { useSeller } from '../context/SellerContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import DateInput from '../components/DateInput';
import {
  History, Search, ChevronDown, ChevronUp, X,
  DollarSign, ShoppingCart, XCircle, Ban, AlertTriangle,
  CreditCard, Banknote, ArrowLeftRight, Landmark, Receipt,
  User, Calendar, Filter, Package
} from 'lucide-react';

const PAGE_SIZE = 25;

const PAYMENT_META = {
  efectivo:      { label: 'Efectivo',       icon: Banknote,       color: '#2E8B57', bg: 'rgba(46,139,87,0.1)' },
  tarjeta:       { label: 'Tarjeta',         icon: CreditCard,     color: '#2E7BBF', bg: 'rgba(46,123,191,0.1)' },
  transferencia: { label: 'Transferencia',   icon: Landmark,       color: '#C8820A', bg: 'rgba(200,130,10,0.1)' },
};

function PaymentChip({ method }) {
  const m = PAYMENT_META[method] || { label: method, icon: ArrowLeftRight, color: '#7A6355', bg: 'rgba(122,99,85,0.1)' };
  const Icon = m.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 99,
      background: m.bg, color: m.color,
      fontSize: '0.78rem', fontWeight: 600,
    }}>
      <Icon size={12} />
      {m.label}
    </span>
  );
}

function SellerBadge({ name }) {
  const initials = name ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'linear-gradient(145deg, var(--color-primary-light), var(--color-primary-dark))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: '0.68rem', fontWeight: 700, flexShrink: 0,
      }}>{initials}</div>
      <span style={{ fontSize: '0.875rem' }}>{name}</span>
    </div>
  );
}

export default function HistorialVentas() {
  const { currentSeller } = useSeller();
  const toast = useToast();
  const isAdmin = currentSeller?.role === 'admin';
  const minDate = (() => { const d = new Date(); d.setDate(d.getDate() - 2); return d.toISOString().split('T')[0]; })();

  const [sales, setSales] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - (isAdmin ? 30 : 2)); return d.toISOString().split('T')[0]; });
  const [dateTo, setDateTo]     = useState(() => new Date().toISOString().split('T')[0]);
  const [filterSeller, setFilterSeller]   = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [filterStatus, setFilterStatus]   = useState('');
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);
  const [showVoidModal, setShowVoidModal] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidConfirm, setVoidConfirm] = useState(false);

  useEffect(() => { setPage(1); }, [dateFrom, dateTo, filterSeller, filterPayment, filterStatus, searchText]);

  const loadData = async () => {
    setLoading(true);
    try {
      const salesData = await api.get('/sales?limit=500');
      setSales(salesData);
      if (isAdmin) {
        const sellersData = await api.get('/sellers');
        setSellers(sellersData);
      }
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    let list = sales;
    if (dateFrom)      list = list.filter(s => s.created_at >= dateFrom);
    if (dateTo)        list = list.filter(s => s.created_at <= dateTo + 'T23:59:59');
    if (filterSeller)  list = list.filter(s => s.seller_id === parseInt(filterSeller));
    if (filterPayment) list = list.filter(s => s.payment_method === filterPayment);
    if (filterStatus)  list = list.filter(s => s.status === filterStatus);
    if (searchText) {
      const t = searchText.toLowerCase();
      list = list.filter(s =>
        String(s.id).includes(t) ||
        s.seller?.name?.toLowerCase().includes(t) ||
        s.items?.some(i => i.product_name.toLowerCase().includes(t))
      );
    }
    return list;
  }, [sales, dateFrom, dateTo, filterSeller, filterPayment, filterStatus, searchText]);

  const paginated   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages  = Math.ceil(filtered.length / PAGE_SIZE);

  const kpis = useMemo(() => {
    const completed = filtered.filter(s => s.status === 'completed');
    return {
      total:   completed.reduce((s, v) => s + v.total, 0),
      count:   completed.length,
      voided:  filtered.filter(s => s.status === 'voided').length,
      avg:     completed.length > 0 ? completed.reduce((s, v) => s + v.total, 0) / completed.length : 0,
    };
  }, [filtered]);

  const hasActiveFilters = filterSeller || filterPayment || filterStatus || searchText;

  const handleVoid = async () => {
    if (!voidConfirm) { setVoidConfirm(true); return; }
    if (voidReason.length < 10) { toast.error('La razón debe tener al menos 10 caracteres'); return; }
    try {
      await api.post(`/sales/${showVoidModal.id}/void`, { reason: voidReason });
      toast.success(`Venta #${showVoidModal.id} anulada`);
      setShowVoidModal(null); setVoidReason(''); setVoidConfirm(false);
      loadData();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">
          <History size={26} style={{ verticalAlign: 'middle', marginRight: 10 }} />
          Historial de Ventas
        </h1>
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
          {filtered.length} resultado{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', marginBottom: 'var(--space-lg)' }}>
        <div className="kpi-card">
          <div className="kpi-icon primary"><DollarSign size={20} /></div>
          <div className="kpi-content">
            <div className="kpi-value">{formatCurrency(kpis.total)}</div>
            <div className="kpi-label">Ingresos período</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon success"><ShoppingCart size={20} /></div>
          <div className="kpi-content">
            <div className="kpi-value">{kpis.count}</div>
            <div className="kpi-label">Ventas completadas</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon info"><Receipt size={20} /></div>
          <div className="kpi-content">
            <div className="kpi-value">{formatCurrency(kpis.avg)}</div>
            <div className="kpi-label">Ticket promedio</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon danger"><XCircle size={20} /></div>
          <div className="kpi-content">
            <div className="kpi-value">{kpis.voided}</div>
            <div className="kpi-label">Anuladas</div>
          </div>
        </div>
      </div>

      {/* Panel de filtros */}
      <div style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-md) var(--space-lg)',
        marginBottom: 'var(--space-lg)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--space-md)', color: 'var(--color-text-secondary)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          <Filter size={13} /> Filtros
          {hasActiveFilters && (
            <button
              onClick={() => { setFilterSeller(''); setFilterPayment(''); setFilterStatus(''); setSearchText(''); }}
              style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <X size={12} /> Limpiar filtros
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-sm)' }}>
          {/* Fecha desde */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Desde</label>
            <DateInput className="form-input" value={dateFrom} min={!isAdmin ? minDate : undefined}
              onChange={e => { if (!isAdmin && e.target.value < minDate) return; setDateFrom(e.target.value); }} />
          </div>

          {/* Fecha hasta */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Hasta</label>
            <DateInput className="form-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>

          {/* Vendedor — solo admin tiene la lista de vendedores */}
          {isAdmin && (
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Vendedor</label>
              <select className="form-input" value={filterSeller} onChange={e => setFilterSeller(e.target.value)}>
                <option value="">Todos</option>
                {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* Método de pago */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Pago</label>
            <select className="form-input" value={filterPayment} onChange={e => setFilterPayment(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(PAYMENT_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          {/* Estado */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Estado</label>
            <select className="form-input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="completed">Completadas</option>
              <option value="voided">Anuladas</option>
            </select>
          </div>

          {/* Búsqueda */}
          <div style={{ gridColumn: 'span 1' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Buscar</label>
            <div className="search-bar" style={{ maxWidth: 'unset' }}>
              <Search className="search-icon" size={15} />
              <input type="text" placeholder="Producto, vendedor, #ID…" value={searchText} onChange={e => setSearchText(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="loading-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-2xl)',
          textAlign: 'center',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-md)' }}>
            <ShoppingCart size={24} style={{ color: 'var(--color-text-light)' }} />
          </div>
          <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 600, marginBottom: 6, color: 'var(--color-text)' }}>Sin resultados</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {hasActiveFilters ? 'Ninguna venta coincide con los filtros aplicados.' : 'No hay ventas registradas en este período.'}
          </p>
        </div>
      ) : (
        <>
          <div className="table-wrapper" style={{ marginBottom: 'var(--space-md)' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  <th>Fecha</th>
                  <th>Vendedor</th>
                  <th>Método</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(sale => (
                  <Fragment key={sale.id}>
                    <tr style={{ opacity: sale.status === 'voided' ? 0.6 : 1 }}>

                      {/* ID */}
                      <td>
                        <span style={{ fontWeight: 700, color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>
                          #{sale.id}
                        </span>
                      </td>

                      {/* Fecha */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                          <Calendar size={13} style={{ color: 'var(--color-text-light)', flexShrink: 0 }} />
                          {formatDate(sale.created_at)}
                        </div>
                      </td>

                      {/* Vendedor */}
                      <td><SellerBadge name={sale.seller?.name || '—'} /></td>

                      {/* Método */}
                      <td><PaymentChip method={sale.payment_method} /></td>

                      {/* Estado */}
                      <td>
                        {sale.status === 'voided'
                          ? <span className="badge badge-danger"><XCircle size={11} style={{ marginRight: 3 }} />Anulada</span>
                          : <span className="badge badge-fresh">Completada</span>}
                      </td>

                      {/* Total */}
                      <td style={{ textAlign: 'right' }}>
                        <span style={{
                          fontWeight: 700,
                          fontSize: '0.95rem',
                          color: sale.status === 'voided' ? 'var(--color-text-secondary)' : 'var(--color-text)',
                          textDecoration: sale.status === 'voided' ? 'line-through' : 'none',
                        }}>
                          {formatCurrency(sale.total)}
                        </span>
                      </td>

                      {/* Acciones */}
                      <td>
                        <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            title="Ver detalle"
                            onClick={() => setExpandedId(expandedId === sale.id ? null : sale.id)}
                            style={{ color: expandedId === sale.id ? 'var(--color-primary)' : undefined }}
                          >
                            {expandedId === sale.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </button>
                          {sale.status === 'completed' && currentSeller?.role === 'admin' && (
                            <button
                              className="btn btn-ghost btn-sm btn-icon"
                              title="Anular venta"
                              style={{ color: 'var(--color-danger)' }}
                              onClick={() => { setShowVoidModal(sale); setVoidReason(''); setVoidConfirm(false); }}
                            >
                              <Ban size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Fila expandida */}
                    {expandedId === sale.id && (
                      <tr>
                        <td colSpan={7} style={{ padding: '0 var(--space-md) var(--space-md)', background: 'var(--color-bg)' }}>
                          <div style={{
                            background: 'var(--color-bg-card)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            overflow: 'hidden',
                          }}>
                            {/* Header detalle */}
                            <div style={{
                              padding: '10px var(--space-md)',
                              borderBottom: '1px solid var(--color-border)',
                              background: 'var(--color-bg)',
                              display: 'flex', alignItems: 'center', gap: 8,
                              fontSize: '0.78rem', fontWeight: 700,
                              color: 'var(--color-text-secondary)',
                              textTransform: 'uppercase', letterSpacing: '0.5px',
                            }}>
                              <Package size={13} />
                              {sale.items?.length} producto{sale.items?.length !== 1 ? 's' : ''} en esta venta
                            </div>

                            {/* Items */}
                            <div style={{ padding: 'var(--space-sm) 0' }}>
                              {sale.items?.map((item, idx) => (
                                <div key={item.id} style={{
                                  display: 'flex', alignItems: 'center',
                                  padding: '8px var(--space-md)',
                                  borderBottom: idx < sale.items.length - 1 ? '1px solid rgba(229,221,210,0.5)' : 'none',
                                  gap: 'var(--space-md)',
                                }}>
                                  <div style={{
                                    width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                                    background: 'var(--color-primary-bg)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0, fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)',
                                  }}>{item.quantity}×</div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.product_name}</div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                                      {formatCurrency(item.price)} c/u
                                      {item.showcase_type && <span style={{ marginLeft: 6, color: 'var(--color-accent)' }}>· {item.showcase_type}</span>}
                                    </div>
                                  </div>
                                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-text)' }}>
                                    {formatCurrency(item.subtotal)}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Total + anulación */}
                            <div style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '10px var(--space-md)',
                              borderTop: '1px solid var(--color-border)',
                              background: 'var(--color-bg)',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <User size={13} style={{ color: 'var(--color-text-light)' }} />
                                <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                                  {sale.seller?.name} · <PaymentChip method={sale.payment_method} />
                                </span>
                              </div>
                              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--color-primary)' }}>
                                {formatCurrency(sale.total)}
                              </div>
                            </div>

                            {/* Razón de anulación */}
                            {sale.status === 'voided' && (
                              <div style={{
                                padding: '10px var(--space-md)',
                                background: 'var(--color-danger-bg)',
                                borderTop: '1px solid rgba(192,57,43,0.15)',
                                display: 'flex', alignItems: 'flex-start', gap: 8,
                                fontSize: '0.82rem', color: 'var(--color-danger)',
                              }}>
                                <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
                                <span><strong>Anulada:</strong> {sale.void_reason}</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-sm)' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Anterior</button>
                <span style={{
                  padding: '5px 14px', fontSize: '0.82rem', fontWeight: 600,
                  background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)', color: 'var(--color-text)',
                }}>
                  {page} / {totalPages}
                </span>
                <button className="btn btn-secondary btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal anulación */}
      {showVoidModal && (
        <div className="modal-overlay" onClick={() => { setShowVoidModal(null); setVoidConfirm(false); }}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 'var(--radius-md)',
                  background: 'var(--color-danger-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ban size={18} style={{ color: 'var(--color-danger)' }} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1rem', marginBottom: 1 }}>Anular Venta #{showVoidModal.id}</h2>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                    {formatCurrency(showVoidModal.total)} · {showVoidModal.seller?.name}
                  </div>
                </div>
              </div>
              <button className="modal-close" onClick={() => { setShowVoidModal(null); setVoidConfirm(false); }}><X size={18} /></button>
            </div>

            <div className="modal-body">
              {voidConfirm && (
                <div style={{
                  display: 'flex', gap: 10, padding: 'var(--space-md)',
                  background: 'var(--color-danger-bg)', borderRadius: 'var(--radius-md)',
                  marginBottom: 'var(--space-md)', fontSize: '0.875rem', color: 'var(--color-danger)',
                  border: '1px solid rgba(192,57,43,0.2)',
                }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>Esta acción <strong>no se puede deshacer</strong>. Se revertirá el stock y el movimiento de caja. ¿Confirmas?</span>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Razón de anulación <span style={{ color: 'var(--color-text-light)', fontWeight: 400 }}>(mín. 10 caracteres)</span></label>
                <textarea
                  className="form-input" rows={3}
                  value={voidReason}
                  onChange={e => setVoidReason(e.target.value)}
                  placeholder="Describe el motivo de la anulación…"
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: voidReason.length >= 10 ? 'var(--color-success)' : 'var(--color-text-light)' }}>
                    {voidReason.length}/10
                  </span>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowVoidModal(null); setVoidConfirm(false); }}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleVoid} disabled={voidReason.length < 10}>
                {voidConfirm ? '¡Confirmar anulación!' : 'Anular venta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
