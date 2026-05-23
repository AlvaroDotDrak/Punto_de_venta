import { X, Banknote, CreditCard, Smartphone, Check } from 'lucide-react';
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
  const cashOk = paymentMethod !== 'efectivo' || !cashReceived || parseInt(cashReceived) >= total;
  const receiptForced = paymentMethod === 'tarjeta';

  return (
    <div className="modal-overlay animate-fade-in" onClick={() => !processing && onClose()} style={{ background: 'rgba(18, 10, 4, 0.65)' }}>
      <div className="modal glass noise-overlay" onClick={e => e.stopPropagation()} style={{ 
        maxWidth: 520, 
        border: 'none', 
        boxShadow: 'var(--shadow-xl)',
        overflow: 'hidden'
      }}>
        {processing && (
          <div className="loading-overlay glass" style={{ zIndex: 10 }}>
            <div className="spinner" />
            <span className="text-display" style={{ fontWeight: 600, marginTop: 12 }}>Procesando el pago...</span>
          </div>
        )}

        <div className="modal-header" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', padding: 'var(--space-lg)' }}>
          <h2 className="text-display" style={{ fontSize: '1.4rem', fontWeight: 800 }}>Finalizar Venta</h2>
          <button className="modal-close" onClick={() => !processing && onClose()} style={{ background: 'var(--color-bg)', borderRadius: '50%', padding: 6 }}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: 'var(--space-xl)' }}>
          {/* Total Display */}
          <div className="payment-total card" style={{ 
            background: 'var(--color-bg-sidebar)', 
            color: '#fff', 
            border: 'none',
            padding: 'var(--space-lg)',
            marginBottom: 'var(--space-xl)',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <div className="label" style={{ color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '1px' }}>
              Monto Total
            </div>
            <div className="amount text-display" style={{ fontSize: '2.8rem', fontWeight: 900, color: '#fff' }}>
              {formatCurrency(total)}
            </div>
          </div>

          {/* Payment Methods */}
          <label className="form-label text-display" style={{ fontSize: '0.9rem', marginBottom: 'var(--space-sm)', opacity: 0.8 }}>
            Selecciona el medio de pago
          </label>
          <div className="payment-methods" style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
            {METHODS.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`payment-method-btn ${paymentMethod === id ? 'selected' : ''}`}
                onClick={() => onMethodChange(id)}
                style={{
                  height: 90,
                  borderWidth: 2,
                  borderRadius: 'var(--radius-lg)',
                  transition: 'all var(--transition-bounce)',
                  position: 'relative'
                }}
              >
                {paymentMethod === id && (
                  <div style={{ position: 'absolute', top: -8, right: -8, background: 'var(--color-primary)', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={12} strokeWidth={3} />
                  </div>
                )}
                <Icon size={24} className="icon" />
                <span style={{ fontWeight: 700 }}>{label}</span>
              </button>
            ))}
          </div>

          {/* Cash Specifics */}
          {paymentMethod === 'efectivo' && (
            <div className="animate-slide-up">
              {/* Billetes rápidos */}
              {(() => {
                const BILLS = [1000, 2000, 5000, 10000, 20000, 50000];
                const suggested = BILLS.find(b => b >= total) ?? BILLS[BILLS.length - 1];
                const currentAmount = parseInt(cashReceived) || 0;

                return (
                  <div style={{ marginBottom: 'var(--space-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <label className="form-label text-display" style={{ marginBottom: 0 }}>Billetes</label>
                      {cashReceived && (
                        <button
                          type="button"
                          onClick={() => onCashChange('')}
                          style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                        >
                          Limpiar
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
                      {BILLS.map(bill => (
                        <button
                          key={bill}
                          type="button"
                          onClick={() => onCashChange(String(currentAmount + bill))}
                          style={{
                            padding: '10px 4px',
                            borderRadius: 'var(--radius-md)',
                            border: `2px solid ${bill === suggested ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            background: bill === suggested ? 'var(--color-primary-bg)' : 'var(--color-bg-card)',
                            color: bill === suggested ? 'var(--color-primary)' : 'var(--color-text)',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          {formatCurrency(bill)}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => onCashChange(String(total))}
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: 'var(--radius-md)',
                        border: '2px dashed var(--color-border)',
                        background: 'var(--color-bg)',
                        color: 'var(--color-text-secondary)',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                    >
                      Monto exacto ({formatCurrency(total)})
                    </button>
                  </div>
                );
              })()}

              <div className="form-group" style={{ marginBottom: 'var(--space-md)' }}>
                <label className="form-label text-display" style={{ fontSize: '0.8rem', opacity: 0.7 }}>O ingresa el monto manualmente</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontWeight: 800, opacity: 0.4 }}>$</span>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="0"
                    value={cashReceived}
                    onChange={e => onCashChange(e.target.value)}
                    autoFocus
                    style={{ paddingLeft: 32, fontSize: '1.2rem', fontWeight: 700, height: 54, borderRadius: 'var(--radius-md)' }}
                  />
                </div>
              </div>
              
              {cashReceived && parseInt(cashReceived) >= total ? (
                <div className="change-calculator glass" style={{ border: 'none', background: 'var(--color-success-bg)', padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)' }}>
                  <div className="change-result">
                    <span className="text-display" style={{ fontWeight: 600 }}>Su vuelto es:</span>
                    <span className="text-display" style={{ color: 'var(--color-success)', fontWeight: 900, fontSize: '1.5rem' }}>
                      {formatCurrency(change)}
                    </span>
                  </div>
                </div>
              ) : cashReceived && (
                <div style={{ 
                  color: 'var(--color-danger)', 
                  fontSize: '0.85rem', 
                  marginTop: 8, 
                  background: 'var(--color-danger-bg)', 
                  padding: '8px 12px', 
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 600
                }}>
                  Faltan {formatCurrency(total - parseInt(cashReceived))} para completar el pago.
                </div>
              )}
            </div>
          )}

          {/* Receipt Toggle */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 12, 
            marginTop: 'var(--space-xl)',
            padding: 'var(--space-md)',
            background: 'var(--color-bg)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)'
          }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                id="has-receipt"
                type="checkbox"
                checked={receiptForced || hasReceipt}
                onChange={e => !receiptForced && onReceiptChange(e.target.checked)}
                disabled={receiptForced}
                style={{ 
                  width: 22, 
                  height: 22, 
                  cursor: receiptForced ? 'default' : 'pointer',
                  accentColor: 'var(--color-primary)'
                }}
              />
            </div>
            <label htmlFor="has-receipt" style={{ 
              fontSize: '0.9rem', 
              cursor: receiptForced ? 'default' : 'pointer', 
              userSelect: 'none',
              fontWeight: 600,
              display: 'flex',
              flexDirection: 'column'
            }}>
              Emitir boleta de venta
              {receiptForced && (
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                  Requerido para pagos con tarjeta Mercado Pago
                </span>
              )}
            </label>
          </div>
        </div>

        <div className="modal-footer" style={{ padding: 'var(--space-lg) var(--space-xl)', borderTop: '1px solid rgba(0,0,0,0.05)', background: 'var(--color-bg-input)' }}>
          <button className="btn btn-secondary" onClick={() => !processing && onClose()} disabled={processing} style={{ height: 48, padding: '0 24px' }}>
            Volver
          </button>
          <button
            className={`btn btn-primary ${processing ? 'btn-loading' : ''}`}
            onClick={onConfirm}
            disabled={processing || !cashOk}
            style={{ 
              flex: 1, 
              height: 48, 
              fontSize: '1rem', 
              boxShadow: 'var(--shadow-md)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            {processing ? 'Confirmando...' : 'Confirmar Pago'}
          </button>
        </div>
      </div>
    </div>
  );
}
