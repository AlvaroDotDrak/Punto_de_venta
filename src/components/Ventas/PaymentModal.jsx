import { X, Banknote, CreditCard, Smartphone } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

const METHODS = [
  { id: 'efectivo',      label: 'Efectivo',      Icon: Banknote },
  { id: 'tarjeta',       label: 'Tarjeta',        Icon: CreditCard },
  { id: 'transferencia', label: 'Transferencia',  Icon: Smartphone },
];

export default function PaymentModal({
  total,
  paymentMethod,
  cashReceived,
  change,
  hasReceipt,
  processing,
  onMethodChange,
  onCashChange,
  onReceiptChange,
  onConfirm,
  onClose,
}) {
  const cashOk = paymentMethod !== 'efectivo' || (cashReceived && parseInt(cashReceived) >= total);
  // Tarjeta siempre emite boleta (Mercado Pago)
  const receiptForced = paymentMethod === 'tarjeta';

  return (
    <div className="modal-overlay" onClick={() => !processing && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {processing && (
          <div className="loading-overlay">
            <div className="spinner" />
            <span>Procesando venta...</span>
          </div>
        )}

        <div className="modal-header">
          <h2>Cobrar Venta</h2>
          <button className="modal-close" onClick={() => !processing && onClose()}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Total */}
          <div className="payment-total">
            <div className="label">Total a cobrar</div>
            <div className="amount">{formatCurrency(total)}</div>
          </div>

          {/* Método */}
          <label className="form-label">Método de pago</label>
          <div className="payment-methods">
            {METHODS.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`payment-method-btn ${paymentMethod === id ? 'selected' : ''}`}
                onClick={() => onMethodChange(id)}
              >
                <Icon size={20} className="icon" />
                {label}
              </button>
            ))}
          </div>

          {/* Boleta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'var(--space-md)' }}>
            <input
              id="has-receipt"
              type="checkbox"
              checked={receiptForced || hasReceipt}
              onChange={e => !receiptForced && onReceiptChange(e.target.checked)}
              disabled={receiptForced}
              style={{ width: 16, height: 16, cursor: receiptForced ? 'default' : 'pointer' }}
            />
            <label htmlFor="has-receipt" style={{ fontSize: '0.875rem', cursor: receiptForced ? 'default' : 'pointer', userSelect: 'none' }}>
              Emitir boleta
              {receiptForced && (
                <span style={{ marginLeft: 6, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                  (automático — tarjeta Mercado Pago)
                </span>
              )}
            </label>
          </div>

          {/* Efectivo: monto recibido y vuelto */}
          {paymentMethod === 'efectivo' && (
            <div>
              <div className="form-group">
                <label className="form-label">Monto recibido</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="Ingrese monto..."
                  value={cashReceived}
                  onChange={e => onCashChange(e.target.value)}
                  autoFocus
                />
              </div>
              {cashReceived && parseInt(cashReceived) >= total && (
                <div className="change-calculator">
                  <div className="change-result">
                    <span>Vuelto:</span>
                    <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>
                      {formatCurrency(change)}
                    </span>
                  </div>
                </div>
              )}
              {cashReceived && parseInt(cashReceived) < total && (
                <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginTop: 4 }}>
                  Monto insuficiente (faltan {formatCurrency(total - parseInt(cashReceived))})
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => !processing && onClose()} disabled={processing}>
            Cancelar
          </button>
          <button
            className={`btn btn-primary btn-lg ${processing ? 'btn-loading' : ''}`}
            onClick={onConfirm}
            disabled={processing || !cashOk}
          >
            {processing ? 'Procesando...' : `Confirmar — ${formatCurrency(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
