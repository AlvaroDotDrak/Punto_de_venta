/**
 * HistorialVentas — Sales history (admin-only page)
 * V2.1: View, filter, and void past sales
 * 
 * FEATURES:
 * - Date range, seller, payment method, text search filters
 * - KPI summary: total sales, revenue, voided count
 * - Sales table with expandable detail
 * - Void sale with mandatory reason + double confirmation + audit log
 */
import { useState, useMemo, useEffect, Fragment } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useSeller } from '../context/SellerContext';
import { useToast } from '../context/ToastContext';
import { formatCurrency, formatDate } from '../utils/formatters';
import { logAction, ACTIONS } from '../utils/auditLog';
import {
  History, Search, Filter, X, ChevronDown, ChevronUp,
  DollarSign, ShoppingCart, XCircle, Eye, Ban, AlertTriangle
} from 'lucide-react';

export default function HistorialVentas() {
  const { currentSeller } = useSeller();
  const toast = useToast();

  // Filters
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterSeller, setFilterSeller] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [searchText, setSearchText] = useState('');

  // Pagination
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);

  // Reset page when any filter changes
  useEffect(() => { setPage(1); }, [dateFrom, dateTo, filterSeller, filterPayment, searchText]);

  // UI state
  const [expandedSaleId, setExpandedSaleId] = useState(null);
  const [showVoidModal, setShowVoidModal] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidConfirm, setVoidConfirm] = useState(false);

  // Load sellers for filter
  const sellers = useLiveQuery(() => db.sellers.toArray(), [], []);

  // Load all sales in date range
  const allSales = useLiveQuery(async () => {
    const from = new Date(dateFrom);
    from.setHours(0, 0, 0, 0);
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);

    const sales = await db.sales
      .where('createdAt')
      .between(from.toISOString(), to.toISOString(), true, true)
      .toArray();

    return sales.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [dateFrom, dateTo], []);

  // Apply additional filters
  const filteredSales = useMemo(() => {
    let result = allSales;
    if (filterSeller) {
      result = result.filter(s => String(s.sellerId) === filterSeller);
    }
    if (filterPayment) {
      result = result.filter(s => s.paymentMethod === filterPayment);
    }
    if (searchText) {
      const term = searchText.toLowerCase();
      result = result.filter(s =>
        String(s.id).includes(term) ||
        (s.sellerName || '').toLowerCase().includes(term)
      );
    }
    return result;
  }, [allSales, filterSeller, filterPayment, searchText]);

  const totalPages = Math.ceil(filteredSales.length / PAGE_SIZE);
  const paginatedSales = filteredSales.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // KPIs
  const kpis = useMemo(() => {
    const completedSales = filteredSales.filter(s => s.status !== 'voided');
    const voidedSales = filteredSales.filter(s => s.status === 'voided');
    return {
      totalSales: completedSales.length,
      totalRevenue: completedSales.reduce((sum, s) => sum + (s.total || 0), 0),
      voidedCount: voidedSales.length,
      voidedAmount: voidedSales.reduce((sum, s) => sum + (s.total || 0), 0),
    };
  }, [filteredSales]);

  // Load sale items for expanded sale
  const saleItems = useLiveQuery(async () => {
    if (!expandedSaleId) return [];
    return db.saleItems.where('saleId').equals(expandedSaleId).toArray();
  }, [expandedSaleId], []);

  // Void a sale (with full reversal of stock and cash)
  const handleVoidSale = async () => {
    if (!showVoidModal || !voidConfirm) return;
    if (voidReason.trim().length < 10) {
      toast.error('El motivo debe tener al menos 10 caracteres');
      return;
    }

    try {
      const now = new Date().toISOString();
      const saleId = showVoidModal.id;

      // 1. Actualizar Venta (Anulada)
      await db.sales.update(saleId, {
        status: 'voided',
        voidedAt: now,
        voidedBy: currentSeller?.id,
        voidReason: voidReason.trim(),
      });

      // 2. REVERTIR STOCK (Showcase Items)
      const soldItems = await db.showcaseItems
        .where('saleId').equals(saleId)
        .toArray();

      if (soldItems.length > 0) {
        // Devolver items a estado 'active' (disponibles en vitrina)
        const updates = soldItems.map(item => ({
          key: item.id,
          changes: { status: 'active', removedAt: null, saleId: null }
        }));
        
        // Ejecutar updates uno a uno (Dexie no tiene bulkUpdate directo así)
        for (const u of updates) {
          await db.showcaseItems.update(u.key, u.changes);
        }
      }

      // 3. REVERTIR CAJA (Solo si fue Efectivo y hay caja abierta)
      if (showVoidModal.paymentMethod === 'efectivo') {
        const openRegister = await db.cashRegister.where('status').equals('open').first();
        if (openRegister) {
          await db.cashMovements.add({
            registerId: openRegister.id,
            type: 'void', // Nuevo tipo de movimiento (revisar si DB lo soporta o usar 'expense')
            amount: -Math.abs(showVoidModal.total), // Monto negativo
            description: `Anulación Venta #${saleId}`,
            paymentMethod: 'efectivo',
            saleId: saleId,
            createdAt: now,
          });
        }
      }

      await logAction(
        ACTIONS.VOID_SALE || 'VOID_SALE',
        currentSeller?.id,
        `Venta #${saleId} anulada. Stock devuelto: ${soldItems.length} items. Monto: ${formatCurrency(showVoidModal.total)}`
      );

      toast.success(`Venta #${saleId} anulada y revertida exitosamente`);
      setShowVoidModal(null);
      setVoidReason('');
      setVoidConfirm(false);
    } catch (err) {
      console.error(err);
      toast.error('Error al anular venta: ' + err.message);
    }
  };

  // Check admin access
  if (currentSeller?.role !== 'admin') {
    return (
      <div className="empty-state">
        <Ban size={48} />
        <h3>Acceso Denegado</h3>
        <p>Solo los administradores pueden acceder al historial de ventas</p>
      </div>
    );
  }

  const paymentLabels = {
    efectivo: '💵 Efectivo',
    tarjeta: '💳 Tarjeta',
    transferencia: '📱 Transferencia',
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <History size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Historial de Ventas
        </h1>
      </div>

      {/* Filters */}
      <div className="historial-filters">
        <div className="filter-row">
          <div className="form-group filter-group">
            <label className="form-label">Desde</label>
            <input
              type="date"
              className="form-input"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
          </div>
          <div className="form-group filter-group">
            <label className="form-label">Hasta</label>
            <input
              type="date"
              className="form-input"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
          </div>
          <div className="form-group filter-group">
            <label className="form-label">Vendedor</label>
            <select className="form-input" value={filterSeller} onChange={e => setFilterSeller(e.target.value)}>
              <option value="">Todos</option>
              {sellers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group filter-group">
            <label className="form-label">Método</label>
            <select className="form-input" value={filterPayment} onChange={e => setFilterPayment(e.target.value)}>
              <option value="">Todos</option>
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </div>
          <div className="form-group filter-group" style={{ flex: 1 }}>
            <label className="form-label">Buscar</label>
            <div className="search-bar" style={{ maxWidth: '100%' }}>
              <Search className="search-icon" size={16} />
              <input
                type="text"
                placeholder="# venta o vendedor..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon primary"><ShoppingCart size={22} /></div>
          <div className="kpi-content">
            <div className="kpi-value">{kpis.totalSales}</div>
            <div className="kpi-label">Ventas válidas</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon success"><DollarSign size={22} /></div>
          <div className="kpi-content">
            <div className="kpi-value">{formatCurrency(kpis.totalRevenue)}</div>
            <div className="kpi-label">Ingresos</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon danger"><XCircle size={22} /></div>
          <div className="kpi-content">
            <div className="kpi-value">{kpis.voidedCount}</div>
            <div className="kpi-label">Anuladas</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon warning"><AlertTriangle size={22} /></div>
          <div className="kpi-content">
            <div className="kpi-value">{formatCurrency(kpis.voidedAmount)}</div>
            <div className="kpi-label">Monto anulado</div>
          </div>
        </div>
      </div>

      {/* Sales Table */}
      {filteredSales.length === 0 ? (
        <div className="empty-state">
          <History size={48} />
          <h3>Sin ventas en este período</h3>
          <p>Ajuste los filtros para ver más resultados</p>
        </div>
      ) : (
        <div className="historial-table-container">
          <table className="historial-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Fecha</th>
                <th>Vendedor</th>
                <th>Método</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSales.map(sale => (
                <Fragment key={sale.id}>
                  <tr className={sale.status === 'voided' ? 'voided-row' : ''}>
                    <td>#{sale.id}</td>
                    <td>{new Date(sale.createdAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>{sale.sellerName || '–'}</td>
                    <td>{paymentLabels[sale.paymentMethod] || sale.paymentMethod}</td>
                    <td className="amount-cell">{formatCurrency(sale.total)}</td>
                    <td>
                      {sale.status === 'voided' ? (
                        <span className="status-badge badge-voided">Anulada</span>
                      ) : (
                        <span className="status-badge badge-completed">Completada</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setExpandedSaleId(expandedSaleId === sale.id ? null : sale.id)}
                          title="Ver detalle"
                        >
                          {expandedSaleId === sale.id ? <ChevronUp size={14} /> : <Eye size={14} />}
                        </button>
                        {sale.status !== 'voided' && (
                          <button
                            className="btn btn-ghost btn-sm text-danger"
                            onClick={() => {
                              setShowVoidModal(sale);
                              setVoidReason('');
                              setVoidConfirm(false);
                            }}
                            title="Anular venta"
                          >
                            <XCircle size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* Expanded detail row */}
                  {expandedSaleId === sale.id && (
                    <tr className="detail-row">
                      <td colSpan="7">
                        <div className="sale-detail-content">
                          <h4>Detalle de Venta #{sale.id}</h4>
                          {saleItems.length > 0 ? (
                            <table className="detail-items-table">
                              <thead>
                                <tr>
                                  <th>Producto</th>
                                  <th>Precio</th>
                                  <th>Cant.</th>
                                  <th>Subtotal</th>
                                </tr>
                              </thead>
                              <tbody>
                                {saleItems.map(item => (
                                  <tr key={item.id}>
                                    <td>{item.productName}</td>
                                    <td>{formatCurrency(item.price)}</td>
                                    <td>{item.quantity}</td>
                                    <td>{formatCurrency(item.subtotal)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p style={{ color: 'var(--color-text-secondary)' }}>Sin detalle disponible</p>
                          )}
                          {sale.status === 'voided' && (
                            <div className="void-info">
                              <strong>Anulada:</strong> {sale.voidReason}
                              <br />
                              <small>Fecha: {sale.voidedAt ? new Date(sale.voidedAt).toLocaleString('es-CL') : '–'}</small>
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
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--space-md)', marginTop: 'var(--space-lg)', flexWrap: 'wrap' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setPage(p => p - 1)}
            disabled={page === 1}
          >
            ‹ Anterior
          </button>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Página {page} de {totalPages} · {filteredSales.length} ventas
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setPage(p => p + 1)}
            disabled={page === totalPages}
          >
            Siguiente ›
          </button>
        </div>
      )}

      {/* Void Sale Modal */}
      {showVoidModal && (
        <div className="modal-overlay" onClick={() => setShowVoidModal(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>⚠️ Anular Venta #{showVoidModal.id}</h2>
              <button className="modal-close" onClick={() => setShowVoidModal(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 'var(--radius-sm)', padding: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                <strong>⚠️ Atención:</strong> Esta acción no se puede deshacer. La venta quedará registrada como anulada en el historial y el log de auditoría.
              </div>

              <div style={{ marginBottom: 'var(--space-md)' }}>
                <strong>Monto:</strong> {formatCurrency(showVoidModal.total)}<br/>
                <strong>Método:</strong> {paymentLabels[showVoidModal.paymentMethod] || showVoidModal.paymentMethod}<br/>
                <strong>Fecha:</strong> {new Date(showVoidModal.createdAt).toLocaleString('es-CL')}
              </div>

              <div className="form-group">
                <label className="form-label">Motivo de anulación <span className="required">*</span></label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Describa el motivo (mínimo 10 caracteres)..."
                  value={voidReason}
                  onChange={e => setVoidReason(e.target.value)}
                  maxLength={500}
                />
                <small style={{ color: voidReason.length < 10 ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
                  {voidReason.length}/500 caracteres (mínimo 10)
                </small>
              </div>

              <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginTop: 'var(--space-md)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={voidConfirm}
                  onChange={e => setVoidConfirm(e.target.checked)}
                />
                <span>Confirmo que deseo anular esta venta</span>
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowVoidModal(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={handleVoidSale}
                disabled={!voidConfirm || voidReason.trim().length < 10}
              >
                <XCircle size={16} /> Anular Venta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
