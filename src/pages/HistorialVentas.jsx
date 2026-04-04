/**
 * HistorialVentas — Historial de ventas con filtros y anulación
 * V3.0: consume FastAPI backend
 */
import { useState, useEffect, useMemo, Fragment } from 'react';
import { useSeller } from '../context/SellerContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import {
  History, Search, X, ChevronDown, ChevronUp,
  DollarSign, ShoppingCart, XCircle, Ban, AlertTriangle
} from 'lucide-react';

const PAGE_SIZE = 25;

export default function HistorialVentas() {
  const { currentSeller } = useSeller();
  const toast = useToast();

  const [sales, setSales] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterSeller, setFilterSeller] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);
  const [showVoidModal, setShowVoidModal] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidConfirm, setVoidConfirm] = useState(false);

  useEffect(() => { setPage(1); }, [dateFrom, dateTo, filterSeller, filterPayment, searchText]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, sel] = await Promise.all([api.get('/sales?limit=500'), api.get('/sellers')]);
      setSales(s);
      setSellers(sel);
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    let list = sales;
    if (dateFrom) list = list.filter(s => s.created_at >= dateFrom);
    if (dateTo) list = list.filter(s => s.created_at <= dateTo + 'T23:59:59');
    if (filterSeller) list = list.filter(s => s.seller_id === parseInt(filterSeller));
    if (filterPayment) list = list.filter(s => s.payment_method === filterPayment);
    if (searchText) {
      const t = searchText.toLowerCase();
      list = list.filter(s =>
        String(s.id).includes(t) ||
        s.seller?.name?.toLowerCase().includes(t) ||
        s.items?.some(i => i.product_name.toLowerCase().includes(t))
      );
    }
    return list;
  }, [sales, dateFrom, dateTo, filterSeller, filterPayment, searchText]);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const kpis = useMemo(() => ({
    total: filtered.filter(s => s.status === 'completed').reduce((s, v) => s + v.total, 0),
    count: filtered.filter(s => s.status === 'completed').length,
    voided: filtered.filter(s => s.status === 'voided').length,
  }), [filtered]);

  const handleVoid = async () => {
    if (!voidConfirm) { setVoidConfirm(true); return; }
    if (voidReason.length < 10) { toast.error('La razón debe tener al menos 10 caracteres'); return; }
    try {
      await api.post(`/sales/${showVoidModal.id}/void`, { reason: voidReason });
      toast.success(`Venta #${showVoidModal.id} anulada`);
      setShowVoidModal(null);
      setVoidReason('');
      setVoidConfirm(false);
      loadData();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <History size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Historial de Ventas
        </h1>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
        {[
          { label: 'Ingresos', value: formatCurrency(kpis.total), icon: <DollarSign size={20} /> },
          { label: 'Ventas', value: kpis.count, icon: <ShoppingCart size={20} /> },
          { label: 'Anuladas', value: kpis.voided, icon: <XCircle size={20} /> },
        ].map(k => (
          <div key={k.label} className="stat-card" style={{ flex: 1, minWidth: 120 }}>
            <div className="stat-icon">{k.icon}</div>
            <div className="stat-value">{k.value}</div>
            <div className="stat-label">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
        <input type="date" className="form-input" style={{ width: 'auto' }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <input type="date" className="form-input" style={{ width: 'auto' }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <select className="form-input" style={{ width: 'auto' }} value={filterSeller} onChange={e => setFilterSeller(e.target.value)}>
          <option value="">Todos los vendedores</option>
          {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="form-input" style={{ width: 'auto' }} value={filterPayment} onChange={e => setFilterPayment(e.target.value)}>
          <option value="">Todos los métodos</option>
          {['efectivo', 'debito', 'credito', 'transferencia'].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <div className="search-bar" style={{ flex: 1, minWidth: 180 }}>
          <Search className="search-icon" size={16} />
          <input type="text" placeholder="Buscar..." value={searchText} onChange={e => setSearchText(e.target.value)} />
        </div>
      </div>

      {loading ? <div className="loading-screen"><div className="spinner" /></div> : (
        <>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>#</th><th>Fecha</th><th>Vendedor</th><th>Método</th><th>Estado</th><th style={{ textAlign: 'right' }}>Total</th><th></th></tr>
              </thead>
              <tbody>
                {paginated.map(sale => (
                  <Fragment key={sale.id}>
                    <tr className={sale.status === 'voided' ? 'row-voided' : ''}>
                      <td>#{sale.id}</td>
                      <td style={{ fontSize: '0.85rem' }}>{formatDate(sale.created_at)}</td>
                      <td>{sale.seller?.name || '—'}</td>
                      <td>{sale.payment_method}</td>
                      <td>
                        {sale.status === 'voided'
                          ? <span className="badge badge-danger"><XCircle size={12} /> Anulada</span>
                          : <span className="badge badge-fresh">Completada</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(sale.total)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setExpandedId(expandedId === sale.id ? null : sale.id)}>
                            {expandedId === sale.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                          {sale.status === 'completed' && currentSeller?.role === 'admin' && (
                            <button className="btn btn-ghost btn-sm" onClick={() => { setShowVoidModal(sale); setVoidReason(''); setVoidConfirm(false); }}>
                              <Ban size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedId === sale.id && (
                      <tr>
                        <td colSpan={7} style={{ background: 'var(--color-surface-secondary)', padding: 'var(--space-md)' }}>
                          <table style={{ width: '100%', fontSize: '0.875rem' }}>
                            <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
                            <tbody>
                              {sale.items?.map(item => (
                                <tr key={item.id}>
                                  <td>{item.product_name}</td>
                                  <td>{item.quantity}</td>
                                  <td>{formatCurrency(item.price)}</td>
                                  <td style={{ textAlign: 'right' }}>{formatCurrency(item.subtotal)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {sale.status === 'voided' && (
                            <div style={{ marginTop: 'var(--space-sm)', color: 'var(--color-danger)', fontSize: '0.8rem' }}>
                              <AlertTriangle size={12} /> Anulada: {sale.void_reason}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'center', marginTop: 'var(--space-md)' }}>
              <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
              <span style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: '0.875rem' }}>{page} / {totalPages}</span>
              <button className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</button>
            </div>
          )}
        </>
      )}

      {showVoidModal && (
        <div className="modal-overlay" onClick={() => { setShowVoidModal(null); setVoidConfirm(false); }}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Ban size={18} /> Anular Venta #{showVoidModal.id}</h2>
              <button className="modal-close" onClick={() => setShowVoidModal(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {voidConfirm && (
                <div className="alert alert-danger" style={{ marginBottom: 'var(--space-md)' }}>
                  <AlertTriangle size={16} /> Esta acción no se puede deshacer. ¿Confirmas la anulación?
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Razón de anulación (mínimo 10 caracteres)</label>
                <textarea className="form-input" rows={3} value={voidReason}
                  onChange={e => setVoidReason(e.target.value)}
                  placeholder="Describe el motivo de la anulación..." />
                <small style={{ color: voidReason.length < 10 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  {voidReason.length}/10 caracteres mínimos
                </small>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowVoidModal(null); setVoidConfirm(false); }}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleVoid} disabled={voidReason.length < 10}>
                {voidConfirm ? '¡Confirmar Anulación!' : 'Anular Venta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
