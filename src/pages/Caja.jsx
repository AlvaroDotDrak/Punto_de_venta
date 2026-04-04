/**
 * Caja — Control de caja (apertura, movimientos, cierre)
 * V3.0: consume FastAPI backend
 */
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '../context/ToastContext';
import { useSeller } from '../context/SellerContext';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import { DollarSign, Lock, Unlock, Plus, ArrowDown, ArrowUp, Clock, X } from 'lucide-react';

export default function Caja() {
  const toast = useToast();
  const { currentSeller } = useSeller();

  const [register, setRegister] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openAmount, setOpenAmount] = useState('');
  const [closeAmount, setCloseAmount] = useState('');
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [movForm, setMovForm] = useState({ amount: '', description: '', type: 'expense' });

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

  useEffect(() => { loadRegister(); }, []);

  const summary = useMemo(() => {
    if (!register) return null;
    const movs = register.movements || [];
    const sales = movs.filter(m => m.type === 'sale');
    const expenses = movs.filter(m => m.type === 'expense');
    const incomes = movs.filter(m => m.type === 'income');
    const voids = movs.filter(m => m.type === 'void');

    const totalSales = sales.reduce((s, m) => s + m.amount, 0);
    const totalExpenses = expenses.reduce((s, m) => s + m.amount, 0);
    const totalIncomes = incomes.reduce((s, m) => s + m.amount, 0);
    const salesCash = sales.filter(m => m.payment_method === 'efectivo').reduce((s, m) => s + m.amount, 0);
    const salesCard = sales.filter(m => m.payment_method === 'debito' || m.payment_method === 'credito').reduce((s, m) => s + m.amount, 0);
    const salesTransfer = sales.filter(m => m.payment_method === 'transferencia').reduce((s, m) => s + m.amount, 0);
    const voidsCash = voids.filter(m => m.payment_method === 'efectivo').reduce((s, m) => s + m.amount, 0);
    const expectedCash = register.opening_amount + salesCash + totalIncomes - totalExpenses + voidsCash;

    return { totalSales, totalExpenses, totalIncomes, salesCash, salesCard, salesTransfer, expectedCash, count: sales.length };
  }, [register]);

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
    if (!closeAmount.trim()) { toast.error('Ingresa el monto real contado en caja'); return; }
    const amount = parseInt(closeAmount);
    if (isNaN(amount) || amount < 0) { toast.error('El monto debe ser positivo o cero'); return; }
    try {
      await api.post('/cash/close', { closing_amount: amount });
      toast.success('Caja cerrada exitosamente');
      setShowCloseModal(false);
      setCloseAmount('');
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
      });
      toast.success(movForm.type === 'expense' ? 'Gasto registrado' : 'Ingreso registrado');
      setShowMovementModal(false);
      setMovForm({ amount: '', description: '', type: 'expense' });
      loadRegister();
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  if (!register) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">
            <DollarSign size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Control de Caja
          </h1>
        </div>
        <div className="empty-state">
          <Lock size={48} />
          <h3>Caja cerrada</h3>
          <p>Abre la caja para comenzar a registrar movimientos del día</p>
          <button className="btn btn-primary btn-lg" onClick={() => setShowOpenModal(true)} style={{ marginTop: 'var(--space-md)' }}>
            <Unlock size={20} /> Abrir Caja
          </button>
        </div>

        {showOpenModal && (
          <div className="modal-overlay" onClick={() => setShowOpenModal(false)}>
            <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Abrir Caja</h2>
                <button className="modal-close" onClick={() => setShowOpenModal(false)}><X size={20} /></button>
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
                <button className="btn btn-secondary" onClick={() => setShowOpenModal(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleOpenRegister}>
                  <Unlock size={16} /> Abrir Caja
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const movements = [...(register.movements || [])].reverse();
  const diff = summary ? (parseInt(closeAmount) || 0) - summary.expectedCash : 0;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <DollarSign size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Control de Caja
        </h1>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button className="btn btn-secondary" onClick={() => setShowMovementModal(true)}>
            <Plus size={16} /> Registrar Movimiento
          </button>
          <button className="btn btn-danger" onClick={() => setShowCloseModal(true)}>
            <Lock size={16} /> Cerrar Caja
          </button>
        </div>
      </div>

      <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
        <Clock size={14} />
        Abierta: {formatDate(register.opened_at)} · Monto inicial: {formatCurrency(register.opening_amount)}
      </div>

      {summary && (
        <div className="cash-summary-grid">
          <div className="cash-summary-card">
            <div className="cash-summary-label">Ventas del día</div>
            <div className="cash-summary-value positive">{formatCurrency(summary.totalSales)}</div>
          </div>
          <div className="cash-summary-card">
            <div className="cash-summary-label">Efectivo</div>
            <div className="cash-summary-value">{formatCurrency(summary.salesCash)}</div>
          </div>
          <div className="cash-summary-card">
            <div className="cash-summary-label">Tarjeta</div>
            <div className="cash-summary-value">{formatCurrency(summary.salesCard)}</div>
          </div>
          <div className="cash-summary-card">
            <div className="cash-summary-label">Transferencia</div>
            <div className="cash-summary-value">{formatCurrency(summary.salesTransfer)}</div>
          </div>
          <div className="cash-summary-card">
            <div className="cash-summary-label">Gastos</div>
            <div className="cash-summary-value negative">{formatCurrency(summary.totalExpenses)}</div>
          </div>
          <div className="cash-summary-card">
            <div className="cash-summary-label">Efectivo esperado</div>
            <div className="cash-summary-value positive">{formatCurrency(summary.expectedCash)}</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Movimientos ({movements.length})</h3>
        </div>
        {movements.length > 0 ? (
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
                      {mov.type === 'sale' && <span className="badge badge-fresh"><ArrowDown size={12} /> Venta</span>}
                      {mov.type === 'expense' && <span className="badge badge-danger"><ArrowUp size={12} /> Gasto</span>}
                      {mov.type === 'income' && <span className="badge badge-info"><ArrowDown size={12} /> Ingreso</span>}
                      {mov.type === 'void' && <span className="badge badge-warning"><ArrowUp size={12} /> Anulación</span>}
                    </td>
                    <td>{mov.description}</td>
                    <td style={{ fontSize: '0.85rem' }}>{mov.payment_method || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: (mov.type === 'expense' || mov.type === 'void') ? 'var(--color-danger)' : 'var(--color-success)' }}>
                      {(mov.type === 'expense') ? '-' : ''}{formatCurrency(Math.abs(mov.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
            <p>Sin movimientos todavía</p>
          </div>
        )}
      </div>

      {/* Movimiento modal */}
      {showMovementModal && (
        <div className="modal-overlay" onClick={() => setShowMovementModal(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Registrar Movimiento</h2>
              <button className="modal-close" onClick={() => setShowMovementModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  {['expense', 'income'].map(t => (
                    <button key={t} className={`btn ${movForm.type === t ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setMovForm(f => ({ ...f, type: t }))}>
                      {t === 'expense' ? 'Gasto' : 'Ingreso'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Monto</label>
                <input type="number" className="form-input" placeholder="Ej: 5000"
                  value={movForm.amount} onChange={e => setMovForm(f => ({ ...f, amount: e.target.value }))} min="1" autoFocus />
              </div>
              <div className="form-group">
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

      {/* Cierre modal */}
      {showCloseModal && (
        <div className="modal-overlay" onClick={() => setShowCloseModal(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Cerrar Caja</h2>
              <button className="modal-close" onClick={() => setShowCloseModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {summary && (
                <div style={{ background: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span>Efectivo esperado</span>
                    <strong>{formatCurrency(summary.expectedCash)}</strong>
                  </div>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Monto real contado</label>
                <input type="number" className="form-input" placeholder="Ingresa el monto contado"
                  value={closeAmount} onChange={e => setCloseAmount(e.target.value)} min="0" autoFocus />
              </div>
              {closeAmount && summary && (
                <div style={{ color: diff >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 600, textAlign: 'center' }}>
                  Diferencia: {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCloseModal(false)}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleCloseRegister}>
                <Lock size={16} /> Cerrar Caja
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
