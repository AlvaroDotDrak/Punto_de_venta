import { X, Banknote, CreditCard, Smartphone } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export default function PaymentModal({
  show, cartTotal, paymentMethod, cashReceived, change, processingPayment,
  onPaymentMethodChange, onCashReceivedChange, onConfirm, onClose,
}) {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={() => !processingPayment && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {processingPayment && (
          <div className="loading-overlay">
            <div className="spinner" />
            <span>Procesando venta...</span>
          </div>
        )}
        <div className="modal-header">
          <h2>Cobrar Venta</h2>
          <button className="modal-close" onClick={() => !processingPayment && onClose()}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="payment-total">
            <div className="label">Total a cobrar</div>
            <div className="amount">{formatCurrency(cartTotal)}</div>
          </div>

          <label className="form-label">Método de pago</label>
          <div className="payment-methods">
            <button
              className={`payment-method-btn ${paymentMethod === 'efectivo' ? 'selected' : ''}`}
              onClick={() => onPaymentMethodChange('efectivo')}
            >
              <Banknote className="icon" /> Efectivo
            </button>
            <button
              className={`payment-method-btn ${paymentMethod === 'tarjeta' ? 'selected' : ''}`}
              onClick={() => onPaymentMethodChange('tarjeta')}
            >
              <CreditCard className="icon" /> Tarjeta
            </button>
            <button
              className={`payment-method-btn ${paymentMethod === 'transferencia' ? 'selected' : ''}`}
              onClick={() => onPaymentMethodChange('transferencia')}
            >
              <Smartphone className="icon" /> Transfer.
            </button>
          </div>

          {paymentMethod === 'efectivo' && (
            <div>
              <div className="form-group">
                <label className="form-label">Monto recibido</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="Ingrese monto..."
                  value={cashReceived}
                  onChange={e => onCashReceivedChange(e.target.value)}
                  autoFocus
                />
              </div>
              {cashReceived && parseInt(cashReceived) >= cartTotal && (
                <div className="change-calculator">
                  <div className="change-result">
                    <span>Vuelto:</span>
                    <span>{formatCurrency(change)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={() => !processingPayment && onClose()}
            disabled={processingPayment}
          >
            Cancelar
          </button>
          <button
            className={`btn btn-primary btn-lg ${processingPayment ? 'btn-loading' : ''}`}
            onClick={onConfirm}
            disabled={processingPayment || (paymentMethod === 'efectivo' && (!cashReceived || parseInt(cashReceived) < cartTotal))}
          >
            {processingPayment ? 'Procesando...' : `Confirmar Venta — ${formatCurrency(cartTotal)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
