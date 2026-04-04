/**
 * Caja — Control de caja (apertura, movimientos, cierre)
 * Validations: positive amounts, required reconciliation
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useToast } from '../context/ToastContext';
import { useSeller } from '../context/SellerContext';
import { formatCurrency, formatDate } from '../utils/formatters';
import { logAction, ACTIONS } from '../utils/auditLog';
import { DollarSign, Lock, Unlock, Plus, Minus, ArrowDown, ArrowUp, Clock, X, CheckCircle } from 'lucide-react';

export default function Caja() {
  const toast = useToast();
  const { currentSeller } = useSeller();
  const [openAmount, setOpenAmount] = useState('');
  const [closeAmount, setCloseAmount] = useState('');
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ amount: '', description: '', type: 'expense' });

  // Get current open register
  const openRegister = useLiveQuery(() =>
    db.cashRegister.where('status').equals('open').first()
  );

  // Get movements for current register
  const movements = useLiveQuery(async () => {
    if (!openRegister) return [];
    return db.cashMovements
      .where('registerId').equals(openRegister.id)
      .reverse()
      .toArray();
  }, [openRegister]);

  // Calculate summaries
  const summary = useLiveQuery(async () => {
    if (!openRegister) return null;
    const movs = await db.cashMovements.where('registerId').equals(openRegister.id).toArray();
    
    const sales = movs.filter(m => m.type === 'sale');
    const expenses = movs.filter(m => m.type === 'expense');
    const incomes = movs.filter(m => m.type === 'income');
    const voids = movs.filter(m => m.type === 'void');

    const totalSales = sales.reduce((s, m) => s + m.amount, 0);
    const totalExpenses = expenses.reduce((s, m) => s + m.amount, 0);
    const totalIncomes = incomes.reduce((s, m) => s + m.amount, 0);
    // void amounts are stored as negative values
    const totalVoids = voids.reduce((s, m) => s + m.amount, 0);

    const salesCash = sales.filter(m => m.paymentMethod === 'efectivo').reduce((s, m) => s + m.amount, 0);
    const salesCard = sales.filter(m => m.paymentMethod === 'tarjeta').reduce((s, m) => s + m.amount, 0);
    const salesTransfer = sales.filter(m => m.paymentMethod === 'transferencia').reduce((s, m) => s + m.amount, 0);
    // void efectivo restituye efectivo de caja (amount ya es negativo)
    const voidsCash = voids.filter(m => m.paymentMethod === 'efectivo').reduce((s, m) => s + m.amount, 0);

    const expectedCash = openRegister.openingAmount + salesCash + totalIncomes - totalExpenses + voidsCash;
    
    return {
      totalSales,
      totalExpenses,
      totalIncomes,
      salesCash,
      salesCard,
      salesTransfer,
      expectedCash,
      transactionCount: sales.length,
    };
  }, [openRegister]);

  // Open register — validate amount ≥ 0
  const handleOpenRegister = async () => {
    const amount = parseInt(openAmount);
    if (isNaN(amount) || amount < 0) {
      toast.error('El monto inicial debe ser un número positivo o cero');
      return;
    }
    try {
      await db.cashRegister.add({
        openedAt: new Date().toISOString(),
        closedAt: null,
        openingAmount: amount,
        closingAmount: null,
        expectedAmount: null,
        status: 'open',
        sellerId: currentSeller?.id,
      });
      toast.success('Caja abierta exitosamente');
      await logAction(ACTIONS.CASH_OPEN, currentSeller?.id, `Monto inicial: ${formatCurrency(amount)}`);
      setShowOpenModal(false);
      setOpenAmount('');
    } catch (err) {
      toast.error('Error al abrir caja: ' + err.message);
    }
  };

  // Close register — require reconciliation amount
  const handleCloseRegister = async () => {
    if (!openRegister || !summary) return;
    
    if (!closeAmount || closeAmount.trim() === '') {
      toast.error('Debes ingresar el monto real contado en caja');
      return;
    }
    
    const closingAmt = parseInt(closeAmount);
    if (isNaN(closingAmt) || closingAmt < 0) {
      toast.error('El monto de cierre debe ser un número positivo o cero');
      return;
    }
    
    try {
      const diff = closingAmt - summary.expectedCash;
      await db.cashRegister.update(openRegister.id, {
        closedAt: new Date().toISOString(),
        closingAmount: closingAmt,
        expectedAmount: summary.expectedCash,
        status: 'closed',
      });
      toast.success('Caja cerrada exitosamente');
      await logAction(ACTIONS.CASH_CLOSE, currentSeller?.id, 
        `Esperado: ${formatCurrency(summary.expectedCash)}, Real: ${formatCurrency(closingAmt)}, Diferencia: ${formatCurrency(diff)}`
      );
      setShowCloseModal(false);
      setCloseAmount('');
    } catch (err) {
      toast.error('Error al cerrar caja: ' + err.message);
    }
  };

  // Add expense/income — validate amount > 0
  const handleAddMovement = async () => {
    if (!openRegister) return;
    const amount = parseInt(expenseForm.amount);
    
    if (isNaN(amount) || amount <= 0) {
      toast.error('El monto debe ser un número mayor a cero');
      return;
    }
    
    if (!expenseForm.description?.trim()) {
      toast.error('La descripción es obligatoria');
      return;
    }

    try {
      await db.cashMovements.add({
        registerId: openRegister.id,
        type: expenseForm.type,
        amount,
        description: expenseForm.description,
        paymentMethod: 'efectivo',
        createdAt: new Date().toISOString(),
      });
      toast.success(expenseForm.type === 'expense' ? 'Gasto registrado' : 'Ingreso registrado');
      setShowExpenseModal(false);
      setExpenseForm({ amount: '', description: '', type: 'expense' });
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  // No register open
  if (!openRegister) {
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

        {/* Open Modal */}
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
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Ej: 20000"
                    value={openAmount}
                    onChange={e => setOpenAmount(e.target.value)}
                    min="0"
                    autoFocus
                  />
                  <small style={{ color: 'var(--color-text-light)', fontSize: '0.75rem' }}>
                    Ingrese 0 si no hay efectivo inicial
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

  const diff = summary ? (parseInt(closeAmount) || 0) - summary.expectedCash : 0;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <DollarSign size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Control de Caja
        </h1>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button className="btn btn-secondary" onClick={() => setShowExpenseModal(true)}>
            <Plus size={16} /> Registrar Movimiento
          </button>
          <button className="btn btn-danger" onClick={() => setShowCloseModal(true)}>
            <Lock size={16} /> Cerrar Caja
          </button>
        </div>
      </div>

      {/* KPI Summary */}
      <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
        <Clock size={14} />
        Abierta: {formatDate(openRegister.openedAt)} · Monto inicial: {formatCurrency(openRegister.openingAmount)}
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

      {/* Movements table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Movimientos ({movements?.length || 0})</h3>
        </div>
        {movements && movements.length > 0 ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Tipo</th>
                  <th>Descripción</th>
                  <th>Método</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {movements.map(mov => (
                  <tr key={mov.id}>
                    <td style={{ fontSize: '0.85rem' }}>{formatDate(mov.createdAt)}</td>
                    <td>
                      {mov.type === 'sale' && <span className="badge badge-fresh"><ArrowDown size={12} /> Venta</span>}
                      {mov.type === 'expense' && <span className="badge badge-danger"><ArrowUp size={12} /> Gasto</span>}
                      {mov.type === 'income' && <span className="badge badge-info"><ArrowDown size={12} /> Ingreso</span>}
                      {mov.type === 'void' && <span className="badge badge-warning"><ArrowUp size={12} /> Anulación</span>}
                    </td>
                    <td>{mov.description}</td>
                    <td style={{ fontSize: '0.85rem' }}>{mov.paymentMethod}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: (mov.type === 'expense' || mov.type === 'void') ? 'var(--color-danger)' : 'var(--color-success)' }}>
                      {mov.type === 'expense' ? '-' : mov.type === 'void' ? '' : '+'}{formatCurrency(Math.abs(mov.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
            <p>No hay movimientos aún</p>
          </div>
        )}
      </div>

      {/* Expense Modal — with validations */}
      {showExpenseModal && (
        <div className="modal-overlay" onClick={() => setShowExpenseModal(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Registrar Movimiento</h2>
              <button className="modal-close" onClick={() => setShowExpenseModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select className="form-select" value={expenseForm.type} onChange={e => setExpenseForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="expense">Gasto / Egreso</option>
                  <option value="income">Ingreso extra</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Monto *</label>
                <input type="number" className="form-input" placeholder="Monto mayor a 0" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} min="1" autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Descripción *</label>
                <input type="text" className="form-input" placeholder="Ej: Compra de insumos" value={expenseForm.description} onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowExpenseModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleAddMovement}>Registrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Close Modal — reconciliation required */}
      {showCloseModal && summary && (
        <div className="modal-overlay" onClick={() => setShowCloseModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Cerrar Caja</h2>
              <button className="modal-close" onClick={() => setShowCloseModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="cash-summary-grid" style={{ marginBottom: 'var(--space-lg)' }}>
                <div className="cash-summary-card">
                  <div className="cash-summary-label">Ventas totales</div>
                  <div className="cash-summary-value positive">{formatCurrency(summary.totalSales)}</div>
                </div>
                <div className="cash-summary-card">
                  <div className="cash-summary-label">Transacciones</div>
                  <div className="cash-summary-value">{summary.transactionCount}</div>
                </div>
                <div className="cash-summary-card">
                  <div className="cash-summary-label">Efectivo esperado</div>
                  <div className="cash-summary-value">{formatCurrency(summary.expectedCash)}</div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Monto real en caja (efectivo contado) *</label>
                <input type="number" className="form-input" placeholder="Cuente el efectivo..." value={closeAmount} onChange={e => setCloseAmount(e.target.value)} min="0" autoFocus />
                <small style={{ color: 'var(--color-text-light)', fontSize: '0.75rem' }}>
                  Obligatorio: cuente el efectivo y registre el monto real
                </small>
              </div>

              {closeAmount && (
                <div style={{
                  padding: 'var(--space-md)',
                  borderRadius: 'var(--radius-md)',
                  background: diff === 0 ? 'var(--color-success-bg)' : diff > 0 ? 'var(--color-info-bg)' : 'var(--color-danger-bg)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                    {diff === 0 ? '✅ Caja cuadrada' : diff > 0 ? '📈 Sobrante' : '📉 Faltante'}
                  </div>
                  <div style={{
                    fontSize: '1.3rem',
                    fontWeight: 700,
                    color: diff === 0 ? 'var(--color-success)' : diff > 0 ? 'var(--color-info)' : 'var(--color-danger)',
                  }}>
                    {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCloseModal(false)}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleCloseRegister} disabled={!closeAmount || closeAmount.trim() === ''}>
                <Lock size={16} /> Confirmar Cierre
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
