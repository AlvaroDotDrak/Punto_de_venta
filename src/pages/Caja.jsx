/**
 * Caja — Control de caja (apertura, movimientos, cierre, historial)
 * V4.0: denominaciones, historial, resumen completo, notas, método de pago en movimientos
 */
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '../context/ToastContext';
import { useSeller } from '../context/SellerContext';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import {
  DollarSign, Lock, Unlock, Plus, ArrowDown, ArrowUp,
  Clock, X, History, ChevronRight, ChevronLeft, FileText,
  TrendingUp, TrendingDown, AlertCircle,
} from 'lucide-react';

// Denominaciones CLP
const DENOMINATIONS = [
  { value: 20000, label: '$20.000' },
  { value: 10000, label: '$10.000' },
  { value: 5000,  label: '$5.000'  },
  { value: 2000,  label: '$2.000'  },
  { value: 1000,  label: '$1.000'  },
  { value: 500,   label: '$500'    },
  { value: 100,   label: '$100'    },
];

const PAYMENT_LABELS = {
  efectivo: '💵 Efectivo',
  tarjeta: '💳 Tarjeta',
  transferencia: '🏦 Transferencia',
};

function calcSummary(register) {
  if (!register) return null;
  const movs = register.movements || [];
  const sales      = movs.filter(m => m.type === 'sale');
  const expenses   = movs.filter(m => m.type === 'expense');
  const incomes    = movs.filter(m => m.type === 'income');
  const voids      = movs.filter(m => m.type === 'void');

  // Montos brutos de ventas
  const salesGross     = sales.reduce((s, m) => s + m.amount, 0);
  const salesCashGross = sales.filter(m => m.payment_method === 'efectivo').reduce((s, m) => s + m.amount, 0);
  // Anulaciones (amounts son negativos en DB)
  const voidsTotal     = voids.reduce((s, m) => s + m.amount, 0);
  const voidsCash      = voids.filter(m => m.payment_method === 'efectivo').reduce((s, m) => s + m.amount, 0);
  // Netos: descuentan las anulaciones
  const totalSales     = salesGross + voidsTotal;
  const salesCash      = salesCashGross + voidsCash;

  const totalExpenses  = expenses.reduce((s, m) => s + m.amount, 0);
  const totalIncomes   = incomes.reduce((s, m) => s + m.amount, 0);
  const salesCard      = sales.filter(m => m.payment_method === 'tarjeta').reduce((s, m) => s + m.amount, 0);
  const salesTransfer  = sales.filter(m => m.payment_method === 'transferencia').reduce((s, m) => s + m.amount, 0);
  const expectedCash   = register.opening_amount + salesCash + totalIncomes - totalExpenses;

  return {
    totalSales, totalExpenses, totalIncomes,
    salesCash, salesCard, salesTransfer,
    expectedCash,
    count: sales.length - voids.length,
    voidCount: voids.length,
  };
}

export default function Caja() {
  const toast = useToast();
  const { currentSeller } = useSeller();
  const isAdmin = currentSeller?.role === 'admin';

  const [register,    setRegister]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [view,        setView]        = useState('current'); // 'current' | 'history'
  const [history,     setHistory]     = useState([]);
  const [histDetail,  setHistDetail]  = useState(null); // caja seleccionada del historial

  // Modales
  const [showOpenModal,     setShowOpenModal]     = useState(false);
  const [showCloseModal,    setShowCloseModal]    = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);

  // Apertura
  const [openAmount, setOpenAmount] = useState('');

  // Cierre
  const [closeNotes,  setCloseNotes]  = useState('');
  const [denomCounts, setDenomCounts] = useState(
    Object.fromEntries(DENOMINATIONS.map(d => [d.value, '']))
  );

  // Movimientos
  const [movForm, setMovForm] = useState({
    amount: '', description: '', type: 'expense', payment_method: 'efectivo',
  });

  const loadRegister = async () => {
    try {
      const data = await api.get('/cash/current');
      setRegister(data);
    } catch {
      setRegister(null);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const data = await api.get('/cash/history?limit=30');
      setHistory(data);
    } catch {
      setHistory([]);
    }
  };

  useEffect(() => { loadRegister(); }, []);
  useEffect(() => { if (view === 'history') loadHistory(); }, [view]);

  const summary = useMemo(() => calcSummary(register), [register]);

  // Total calculado por denominaciones
  const denomTotal = useMemo(() =>
    DENOMINATIONS.reduce((sum, d) => sum + (parseInt(denomCounts[d.value]) || 0) * d.value, 0),
  [denomCounts]);

  const diff = summary ? denomTotal - summary.expectedCash : 0;

  // ── HANDLERS ──────────────────────────────────────────────────────────────

  const handleOpenRegister = async () => {
    const amount = parseInt(openAmount);
    if (isNaN(amount) || amount < 0) { toast.error('El monto debe ser un número positivo o cero'); return; }
    try {
      await api.post('/cash/open', { opening_amount: amount });
      toast.success('Caja abierta exitosamente');
      setShowOpenModal(false);
      setOpenAmount('');
      loadRegister();
    } catch (err) { toast.error('Error al abrir caja: ' + err.message); }
  };

  const handleCloseRegister = async () => {
    if (denomTotal <= 0 && !Object.values(denomCounts).some(v => parseInt(v) > 0)) {
      toast.error('Ingresa las denominaciones para contar el efectivo');
      return;
    }
    try {
      await api.post('/cash/close', {
        closing_amount: denomTotal,
        notes: closeNotes.trim() || null,
      });
      toast.success('Caja cerrada exitosamente');
      setShowCloseModal(false);
      setCloseNotes('');
      setDenomCounts(Object.fromEntries(DENOMINATIONS.map(d => [d.value, ''])));
      loadRegister();
    } catch (err) { toast.error('Error al cerrar caja: ' + err.message); }
  };

  const handleAddMovement = async () => {
    const amount = parseInt(movForm.amount);
    if (isNaN(amount) || amount <= 0) { toast.error('El monto debe ser mayor a cero'); return; }
    if (!movForm.description?.trim()) { toast.error('La descripción es obligatoria'); return; }
    try {
      await api.post('/cash/movements', {
        type: movForm.type,
        amount,
        description: movForm.description,
        payment_method: movForm.payment_method || null,
      });
      toast.success(movForm.type === 'expense' ? 'Gasto registrado' : 'Ingreso registrado');
      setShowMovementModal(false);
      setMovForm({ amount: '', description: '', type: 'expense', payment_method: 'efectivo' });
      loadRegister();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  const handleHistDetail = async (reg) => {
    try {
      const data = await api.get(`/cash/history/${reg.id}`);
      setHistDetail(data);
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  // ── RENDER HELPERS ────────────────────────────────────────────────────────

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  // ── VISTA: CAJA CERRADA (sin caja activa) ─────────────────────────────────
  if (!register && view === 'current') {
    return (
      <div>
        <PageHeader view={view} setView={setView} register={register} />
        <div className="empty-state">
          <Lock size={48} />
          <h3>Caja cerrada</h3>
          <p>Abre la caja para comenzar a registrar movimientos del día</p>
          <button className="btn btn-primary btn-lg" onClick={() => setShowOpenModal(true)} style={{ marginTop: 'var(--space-md)' }}>
            <Unlock size={20} /> Abrir Caja
          </button>
        </div>

        <OpenModal
          show={showOpenModal} onClose={() => setShowOpenModal(false)}
          openAmount={openAmount} setOpenAmount={setOpenAmount}
          onConfirm={handleOpenRegister}
        />
      </div>
    );
  }

  // ── VISTA: HISTORIAL ──────────────────────────────────────────────────────
  if (view === 'history') {
    return (
      <div>
        <PageHeader view={view} setView={setView} register={register} />

        {histDetail ? (
          <HistoryDetail
            reg={histDetail}
            onBack={() => setHistDetail(null)}
          />
        ) : (
          <HistoryList
            history={history}
            onSelect={handleHistDetail}
          />
        )}
      </div>
    );
  }

  // ── VISTA: CAJA ABIERTA ───────────────────────────────────────────────────
  const movements = [...(register.movements || [])].reverse();

  return (
    <div>
      <PageHeader view={view} setView={setView} register={register}
        onMovement={() => setShowMovementModal(true)}
        onClose={isAdmin ? () => { setShowCloseModal(true); } : null}
      />

      <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
        <Clock size={14} />
        Abierta: {formatDate(register.opened_at)} · Monto inicial: {formatCurrency(register.opening_amount)}
      </div>

      {summary && (
        <div className="cash-summary-grid">
          {[
            { label: 'Ventas del día',     value: formatCurrency(summary.totalSales),    sub: `${summary.count} transacciones`,          positive: true },
            { label: 'Efectivo',           value: formatCurrency(summary.salesCash),     sub: 'en ventas' },
            { label: 'Tarjeta',            value: formatCurrency(summary.salesCard),     sub: 'débito + crédito' },
            { label: 'Transferencia',      value: formatCurrency(summary.salesTransfer), sub: 'en ventas' },
            { label: 'Ingresos manuales',  value: formatCurrency(summary.totalIncomes),  sub: 'registros manuales',                       positive: true },
            { label: 'Gastos',             value: formatCurrency(summary.totalExpenses), sub: 'registros manuales',                       negative: true },
            { label: 'Efectivo esperado',  value: formatCurrency(summary.expectedCash),  sub: 'apertura + efectivo',                      positive: true },
          ].map(c => (
            <div key={c.label} className="cash-summary-card">
              <div className="cash-summary-label">{c.label}</div>
              <div className={`cash-summary-value ${c.positive ? 'positive' : c.negative ? 'negative' : ''}`}>{c.value}</div>
              {c.sub && <div style={{ fontSize: '0.72rem', color: 'var(--color-text-light)', marginTop: 2 }}>{c.sub}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Movimientos ({movements.length})</h3>
        </div>
        <MovementsTable movements={movements} />
      </div>

      {/* Modal: Registrar movimiento */}
      {showMovementModal && (
        <div className="modal-overlay" onClick={() => setShowMovementModal(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Registrar Movimiento</h2>
              <button className="modal-close" onClick={() => setShowMovementModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tipo</label>
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  {[['expense', '↑ Gasto'], ['income', '↓ Ingreso']].map(([t, lbl]) => (
                    <button key={t} className={`btn ${movForm.type === t ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setMovForm(f => ({ ...f, type: t }))}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Método de pago</label>
                <select className="form-input" value={movForm.payment_method}
                  onChange={e => setMovForm(f => ({ ...f, payment_method: e.target.value }))}>
                  <option value="efectivo">💵 Efectivo</option>
                  <option value="tarjeta">💳 Tarjeta</option>
                  <option value="transferencia">🏦 Transferencia</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Monto</label>
                <input type="number" className="form-input" placeholder="Ej: 5000"
                  value={movForm.amount} onChange={e => setMovForm(f => ({ ...f, amount: e.target.value }))} min="1" autoFocus />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Descripción</label>
                <input type="text" className="form-input" placeholder="Ej: Compra de azúcar"
                  value={movForm.description} onChange={e => setMovForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowMovementModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleAddMovement}>Registrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Cerrar caja */}
      {showCloseModal && (
        <div className="modal-overlay" onClick={() => setShowCloseModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--color-danger-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Lock size={16} style={{ color: 'var(--color-danger)' }} />
                </div>
                <h2>Cerrar Caja</h2>
              </div>
              <button className="modal-close" onClick={() => setShowCloseModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>

              {/* Resumen del día */}
              {summary && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 'var(--space-sm)', color: 'var(--color-text-secondary)' }}>
                    Resumen del día
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {[
                      ['Ventas (' + summary.count + ')',    formatCurrency(summary.totalSales),    false],
                      ['Efectivo ventas',                    formatCurrency(summary.salesCash),     false],
                      ['Tarjeta',                            formatCurrency(summary.salesCard),     false],
                      ['Transferencia',                      formatCurrency(summary.salesTransfer), false],
                      ['Ingresos manuales',                  formatCurrency(summary.totalIncomes),  false],
                      ['Gastos',                             formatCurrency(summary.totalExpenses), true],
                    ].map(([lbl, val, neg]) => (
                      <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '4px 8px', borderRadius: 6, background: 'var(--color-bg)' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>{lbl}</span>
                        <strong style={{ color: neg ? 'var(--color-danger)' : undefined }}>{val}</strong>
                      </div>
                    ))}
                    <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 700, padding: '6px 8px', borderRadius: 6, background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
                      <span>Efectivo esperado</span>
                      <span>{formatCurrency(summary.expectedCash)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Calculadora de denominaciones */}
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 'var(--space-sm)', color: 'var(--color-text-secondary)' }}>
                  Conteo de billetes y monedas
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '6px 12px', alignItems: 'center' }}>
                  {DENOMINATIONS.map(d => (
                    <>
                      <span key={d.value + '-lbl'} style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{d.label}</span>
                      <input
                        key={d.value + '-input'}
                        type="number" min="0"
                        className="form-input"
                        style={{ padding: '6px 10px', textAlign: 'center' }}
                        placeholder="0"
                        value={denomCounts[d.value]}
                        onChange={e => setDenomCounts(prev => ({ ...prev, [d.value]: e.target.value }))}
                      />
                      <span key={d.value + '-total'} style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', minWidth: 80, textAlign: 'right' }}>
                        {formatCurrency((parseInt(denomCounts[d.value]) || 0) * d.value)}
                      </span>
                    </>
                  ))}
                </div>

                <div style={{ marginTop: 'var(--space-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-secondary)', fontWeight: 700 }}>
                  <span>Total contado</span>
                  <span style={{ fontSize: '1.1rem' }}>{formatCurrency(denomTotal)}</span>
                </div>

                {denomTotal > 0 && summary && (
                  <div style={{
                    marginTop: 8, padding: '8px 12px', borderRadius: 'var(--radius-md)',
                    background: Math.abs(diff) < 500 ? 'rgba(46,139,87,0.08)' : 'rgba(192,57,43,0.08)',
                    color: Math.abs(diff) < 500 ? 'var(--color-success)' : 'var(--color-danger)',
                    fontWeight: 700, display: 'flex', justifyContent: 'space-between',
                  }}>
                    <span>Diferencia</span>
                    <span>{diff >= 0 ? '+' : ''}{formatCurrency(diff)}</span>
                  </div>
                )}
              </div>

              {/* Notas */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Observaciones del día <span style={{ fontWeight: 400, color: 'var(--color-text-light)' }}>(opcional)</span></label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Ej: Máquina de tarjeta con problemas, faltó cambio, etc."
                  value={closeNotes}
                  onChange={e => setCloseNotes(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCloseModal(false)}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleCloseRegister}>
                <Lock size={16} /> Cerrar Caja — {formatCurrency(denomTotal)}
              </button>
            </div>
          </div>
        </div>
      )}

      <OpenModal
        show={showOpenModal} onClose={() => setShowOpenModal(false)}
        openAmount={openAmount} setOpenAmount={setOpenAmount}
        onConfirm={handleOpenRegister}
      />
    </div>
  );
}

// ── SUB-COMPONENTES ────────────────────────────────────────────────────────

function PageHeader({ view, setView, register, onMovement, onClose }) {
  return (
    <div className="page-header">
      <h1 className="page-title">
        <DollarSign size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />
        Control de Caja
      </h1>
      <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Toggle historial */}
        <button
          className={`btn ${view === 'history' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setView(v => v === 'history' ? 'current' : 'history')}
        >
          <History size={16} /> Historial
        </button>

        {/* Acciones caja abierta */}
        {register && view === 'current' && (
          <>
            {onMovement && (
              <button className="btn btn-secondary" onClick={onMovement}>
                <Plus size={16} /> Movimiento
              </button>
            )}
            {onClose && (
              <button className="btn btn-danger" onClick={onClose}>
                <Lock size={16} /> Cerrar Caja
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MovementsTable({ movements }) {
  if (movements.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
        <p>Sin movimientos todavía</p>
      </div>
    );
  }
  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr><th>Hora</th><th>Tipo</th><th>Descripción</th><th>Método</th><th style={{ textAlign: 'right' }}>Monto</th></tr>
        </thead>
        <tbody>
          {movements.map(mov => (
            <tr key={mov.id}>
              <td style={{ fontSize: '0.85rem' }}>{formatDate(mov.created_at)}</td>
              <td>
                {mov.type === 'sale'    && <span className="badge badge-fresh"><ArrowDown size={12} /> Venta</span>}
                {mov.type === 'expense' && <span className="badge badge-danger"><ArrowUp size={12} /> Gasto</span>}
                {mov.type === 'income'  && <span className="badge badge-info"><ArrowDown size={12} /> Ingreso</span>}
                {mov.type === 'void'    && <span className="badge badge-warning"><ArrowUp size={12} /> Anulación</span>}
              </td>
              <td>{mov.description || '—'}</td>
              <td style={{ fontSize: '0.85rem' }}>{mov.payment_method ? PAYMENT_LABELS[mov.payment_method] || mov.payment_method : '—'}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: (mov.type === 'expense' || mov.type === 'void') ? 'var(--color-danger)' : 'var(--color-success)' }}>
                {(mov.type === 'expense') ? '-' : ''}{formatCurrency(Math.abs(mov.amount))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryList({ history, onSelect }) {
  if (history.length === 0) {
    return (
      <div className="empty-state">
        <History size={40} />
        <h3>Sin historial</h3>
        <p>Aquí aparecerán las cajas cerradas anteriores.</p>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Cajas cerradas</h3>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Apertura</th>
              <th>Cierre</th>
              <th style={{ textAlign: 'right' }}>Monto inicial</th>
              <th style={{ textAlign: 'right' }}>Contado</th>
              <th style={{ textAlign: 'right' }}>Esperado</th>
              <th style={{ textAlign: 'right' }}>Diferencia</th>
              <th>Notas</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {history.map(reg => {
              const dif = reg.closing_amount != null && reg.expected_amount != null
                ? reg.closing_amount - reg.expected_amount : null;
              return (
                <tr key={reg.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(reg)}>
                  <td style={{ fontSize: '0.85rem' }}>{formatDate(reg.opened_at)}</td>
                  <td style={{ fontSize: '0.85rem' }}>{formatDate(reg.closed_at)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(reg.opening_amount)}</td>
                  <td style={{ textAlign: 'right' }}>{reg.closing_amount != null ? formatCurrency(reg.closing_amount) : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{reg.expected_amount != null ? formatCurrency(reg.expected_amount) : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: dif == null ? undefined : Math.abs(dif) < 500 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {dif != null ? `${dif >= 0 ? '+' : ''}${formatCurrency(dif)}` : '—'}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={reg.notes}>
                    {reg.notes || '—'}
                  </td>
                  <td><ChevronRight size={16} style={{ color: 'var(--color-text-light)' }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistoryDetail({ reg, onBack }) {
  const summary = useMemo(() => calcSummary(reg), [reg]);
  const movements = [...(reg.movements || [])].reverse();
  const diff = reg.closing_amount != null && reg.expected_amount != null
    ? reg.closing_amount - reg.expected_amount : null;

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 'var(--space-md)' }}>
        <ChevronLeft size={16} /> Volver al historial
      </button>

      <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', marginBottom: 'var(--space-md)', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
        <span><Clock size={13} style={{ verticalAlign: 'middle' }} /> Apertura: {formatDate(reg.opened_at)}</span>
        <span><Lock size={13} style={{ verticalAlign: 'middle' }} /> Cierre: {formatDate(reg.closed_at)}</span>
        <span>Inicial: <strong>{formatCurrency(reg.opening_amount)}</strong></span>
      </div>

      {summary && (
        <div className="cash-summary-grid" style={{ marginBottom: 'var(--space-md)' }}>
          {[
            { label: 'Ventas',             value: formatCurrency(summary.totalSales),    positive: true },
            { label: 'Efectivo ventas',    value: formatCurrency(summary.salesCash) },
            { label: 'Tarjeta',            value: formatCurrency(summary.salesCard) },
            { label: 'Transferencia',      value: formatCurrency(summary.salesTransfer) },
            { label: 'Ingresos manuales',  value: formatCurrency(summary.totalIncomes),  positive: true },
            { label: 'Gastos',             value: formatCurrency(summary.totalExpenses), negative: true },
            { label: 'Efectivo esperado',  value: formatCurrency(reg.expected_amount),   positive: true },
            { label: 'Efectivo contado',   value: formatCurrency(reg.closing_amount) },
          ].map(c => (
            <div key={c.label} className="cash-summary-card">
              <div className="cash-summary-label">{c.label}</div>
              <div className={`cash-summary-value ${c.positive ? 'positive' : c.negative ? 'negative' : ''}`}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {diff != null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 16px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)',
          background: Math.abs(diff) < 500 ? 'rgba(46,139,87,0.08)' : 'rgba(192,57,43,0.08)',
          color: Math.abs(diff) < 500 ? 'var(--color-success)' : 'var(--color-danger)',
          fontWeight: 700,
        }}>
          {Math.abs(diff) < 500 ? <TrendingUp size={18} /> : <AlertCircle size={18} />}
          Diferencia del cierre: {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
        </div>
      )}

      {reg.notes && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 16px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', border: '1px solid var(--color-border)', marginBottom: 'var(--space-md)', fontSize: '0.875rem' }}>
          <FileText size={16} style={{ color: 'var(--color-text-light)', flexShrink: 0, marginTop: 1 }} />
          <span>{reg.notes}</span>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Movimientos ({movements.length})</h3>
        </div>
        <MovementsTable movements={movements} />
      </div>
    </div>
  );
}

function OpenModal({ show, onClose, openAmount, setOpenAmount, onConfirm }) {
  if (!show) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Abrir Caja</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Monto inicial en caja</label>
            <input type="number" className="form-input" placeholder="Ej: 20000"
              value={openAmount} onChange={e => setOpenAmount(e.target.value)} min="0" autoFocus />
            <small style={{ color: 'var(--color-text-light)', fontSize: '0.75rem' }}>
              Ingresa 0 si no hay efectivo inicial
            </small>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onConfirm}>
            <Unlock size={16} /> Abrir Caja
          </button>
        </div>
      </div>
    </div>
  );
}
