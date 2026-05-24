import { useState } from 'react';
import { X, Banknote, CreditCard, Smartphone, Check } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

const METHODS = [
  { id: 'efectivo',      label: 'Efectivo',      Icon: Banknote },
  { id: 'tarjeta',       label: 'Tarjeta',        Icon: CreditCard },
  { id: 'transferencia', label: 'Transferencia',  Icon: Smartphone },
];

const BILLS = [1000, 2000, 5000, 10000, 20000];

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
  const [pressedBill, setPressedBill] = useState(null);
  const [feedbackKey, setFeedbackKey] = useState(0);
  const [feedbackAmount, setFeedbackAmount] = useState(null);

  const cashOk = paymentMethod !== 'efectivo' || !cashReceived || parseInt(cashReceived) >= total;
  const receiptForced = paymentMethod === 'tarjeta';
  const suggested = BILLS.find(b => b >= total) ?? BILLS[BILLS.length - 1];

  const handleBillPress = (bill) => {
    const currentAmount = parseInt(cashReceived) || 0;
    onCashChange(String(currentAmount + bill));
    setPressedBill(bill);
    setFeedbackAmount(bill);
    setFeedbackKey(k => k + 1);
    setTimeout(() => setPressedBill(null), 220);
  };

  const cashAmount = parseInt(cashReceived) || 0;

  return (
    <div className="modal-overlay animate-fade-in" onClick={() => !processing && onClose()} style={{ background: 'rgba(18, 10, 4, 0.65)' }}>
      <div className="modal glass noise-overlay" onClick={e => e.stopPropagation()} style={{
        maxWidth: 480,
        border: 'none',
        boxShadow: 'var(--shadow-xl)',
        overflow: 'hidden',
      }}>
        {processing && (
          <div className="loading-overlay glass" style={{ zIndex: 10 }}>
            <div className="spinner" />
            <span className="text-display" style={{ fontWeight: 600, marginTop: 12 }}>Procesando el pago...</span>
          </div>
        )}

        {/* Header */}
        <div className="modal-header" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', padding: '12px var(--space-lg)' }}>
          <h2 className="text-display" style={{ fontSize: '1.2rem', fontWeight: 800 }}>Finalizar Venta</h2>
          <button className="modal-close" onClick={() => !processing && onClose()} style={{ background: 'var(--color-bg)', borderRadius: '50%', padding: 6 }}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: 'var(--space-md) var(--space-lg)' }}>

          {/* Total — compacto */}
          <div style={{
            background: 'var(--color-bg-sidebar)',
            color: '#fff',
            borderRadius: 'var(--radius-lg)',
            padding: '10px 16px',
            marginBottom: 'var(--space-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: 'var(--shadow-lg)',
          }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '1px' }}>
              Total
            </span>
            <span className="text-display" style={{ fontSize: '2rem', fontWeight: 900 }}>
              {formatCurrency(total)}
            </span>
          </div>

          {/* Métodos de pago */}
          <div className="payment-methods" style={{ gap: 8, marginBottom: 'var(--space-md)' }}>
            {METHODS.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`payment-method-btn ${paymentMethod === id ? 'selected' : ''}`}
                onClick={() => onMethodChange(id)}
                style={{
                  height: 82,
                  borderWidth: 2,
                  borderRadius: 'var(--radius-lg)',
                  transition: 'all var(--transition-bounce)',
                  position: 'relative',
                }}
              >
                {paymentMethod === id && (
                  <div style={{ position: 'absolute', top: -8, right: -8, background: 'var(--color-primary)', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={12} strokeWidth={3} />
                  </div>
                )}
                <Icon size={28} className="icon" />
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{label}</span>
              </button>
            ))}
          </div>

          {/* Sección efectivo */}
          {paymentMethod === 'efectivo' && (
            <div className="animate-slide-up">

              {/* Billetes — fila única */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Billetes</span>
                  {cashReceived && (
                    <button type="button" onClick={() => { onCashChange(''); setFeedbackAmount(null); }}
                      style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                      Limpiar
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 6 }}>
                  {BILLS.map(bill => {
                    const isSuggested = bill === suggested;
                    const isPressed = pressedBill === bill;
                    return (
                      <button
                        key={bill}
                        type="button"
                        onClick={() => handleBillPress(bill)}
                        style={{
                          padding: '9px 2px',
                          borderRadius: 'var(--radius-md)',
                          border: `2px solid ${isSuggested ? 'var(--color-primary)' : 'var(--color-border)'}`,
                          background: isSuggested ? 'var(--color-primary)' : 'var(--color-bg-card)',
                          color: isSuggested ? '#fff' : 'var(--color-text)',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          animation: isPressed ? 'bill-tap 0.22s ease-out' : 'none',
                          boxShadow: isSuggested ? 'var(--shadow-md)' : 'none',
                        }}
                      >
                        {formatCurrency(bill)}
                      </button>
                    );
                  })}
                </div>

                <button type="button" onClick={() => onCashChange(String(total))}
                  style={{
                    width: '100%', padding: '7px',
                    borderRadius: 'var(--radius-md)',
                    border: '2px dashed var(--color-border)',
                    background: 'var(--color-bg)',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
                  }}>
                  Monto exacto ({formatCurrency(total)})
                </button>
              </div>

              {/* Recibido + vuelto en una línea */}
              {cashReceived && cashAmount > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 8,
                  background: cashAmount >= total ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                  border: `1px solid ${cashAmount >= total ? 'rgba(46,139,87,0.2)' : 'rgba(192,57,43,0.2)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Recibido</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {feedbackAmount && (
                        <span key={feedbackKey} style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 700, animation: 'bill-feedback-fade 0.85s ease-out forwards', display: 'inline-block' }}>
                          +{formatCurrency(feedbackAmount)}
                        </span>
                      )}
                      <span key={`amt-${cashReceived}`} style={{ fontWeight: 800, fontSize: '1rem', display: 'inline-block', animation: 'bill-amount-pop 0.28s ease-out' }}>
                        {formatCurrency(cashAmount)}
                      </span>
                    </div>
                  </div>
                  {cashAmount >= total ? (
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-success)', fontWeight: 700, display: 'block' }}>Vuelto</span>
                      <span style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--color-success)' }}>{formatCurrency(change)}</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-danger)', fontWeight: 700 }}>
                      Faltan {formatCurrency(total - cashAmount)}
                    </span>
                  )}
                </div>
              )}

              {/* Input manual */}
              <div style={{ position: 'relative', marginBottom: 'var(--space-sm)' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontWeight: 800, opacity: 0.4, fontSize: '0.9rem' }}>$</span>
                <input
                  type="number"
                  className="form-input"
                  placeholder="Ingresa monto manualmente"
                  value={cashReceived}
                  onChange={e => onCashChange(e.target.value)}
                  autoFocus
                  style={{ paddingLeft: 26, fontSize: '0.95rem', fontWeight: 700, height: 42 }}
                />
              </div>
            </div>
          )}

          {/* Boleta */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginTop: 'var(--space-sm)',
            padding: '8px 12px',
            background: 'var(--color-bg)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
          }}>
            <input
              id="has-receipt"
              type="checkbox"
              checked={receiptForced || hasReceipt}
              onChange={e => !receiptForced && onReceiptChange(e.target.checked)}
              disabled={receiptForced}
              style={{ width: 20, height: 20, cursor: receiptForced ? 'default' : 'pointer', accentColor: 'var(--color-primary)', flexShrink: 0 }}
            />
            <label htmlFor="has-receipt" style={{ fontSize: '0.875rem', cursor: receiptForced ? 'default' : 'pointer', userSelect: 'none', fontWeight: 600 }}>
              Emitir boleta
              {receiptForced && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', fontWeight: 500, marginLeft: 6 }}>Requerido — tarjeta</span>}
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ padding: '10px var(--space-lg)', borderTop: '1px solid rgba(0,0,0,0.05)', background: 'var(--color-bg-input)' }}>
          <button className="btn btn-secondary" onClick={() => !processing && onClose()} disabled={processing} style={{ height: 44, padding: '0 20px' }}>
            Volver
          </button>
          <button
            className={`btn btn-primary ${processing ? 'btn-loading' : ''}`}
            onClick={onConfirm}
            disabled={processing || !cashOk}
            style={{ flex: 1, height: 44, fontSize: '1rem', boxShadow: 'var(--shadow-md)', textTransform: 'uppercase', letterSpacing: '0.5px' }}
          >
            {processing ? 'Confirmando...' : 'Confirmar Pago'}
          </button>
        </div>
      </div>
    </div>
  );
}
