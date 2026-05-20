import { X, Printer, CheckCircle2, ShoppingBasket } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function ReceiptModal({ sale, onClose }) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ background: 'rgba(18, 10, 4, 0.7)' }}>
      <div className="modal glass noise-overlay" onClick={e => e.stopPropagation()} style={{ 
        maxWidth: 480, 
        border: 'none', 
        boxShadow: 'var(--shadow-xl)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden'
      }}>
        <div className="modal-body" style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>
          <div className="animate-scale-in" style={{ 
            width: 70, 
            height: 70, 
            background: 'var(--color-success-bg)', 
            color: 'var(--color-success)', 
            borderRadius: '50%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            margin: '0 auto var(--space-lg)'
          }}>
            <CheckCircle2 size={40} strokeWidth={1.5} />
          </div>

          <h2 className="text-display" style={{ fontSize: '1.6rem', fontWeight: 900, marginBottom: 8 }}>Venta Completada</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xl)', fontSize: '0.9rem' }}>
            La transacción ha sido registrada con éxito.
          </p>

          {/* TICKET / BOLETA */}
          <div className="card" style={{ 
            textAlign: 'left', 
            background: '#fff', 
            padding: '24px', 
            borderRadius: 'var(--radius-lg)',
            border: '1px dashed var(--color-border)',
            marginBottom: 'var(--space-xl)',
            boxShadow: 'none',
            color: '#000'
          }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, fontFamily: 'var(--font-heading)', color: 'var(--color-primary)' }}>TÍA JULIA</div>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 700, opacity: 0.7 }}>Pastelería Artesanal</div>
              <div style={{ fontSize: '0.7rem', marginTop: 4, opacity: 0.6 }}>Calle de las Delicias #123, Ciudad</div>
            </div>

            <div style={{ borderTop: '1px dashed #eee', borderBottom: '1px dashed #eee', padding: '12px 0', margin: '12px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                <span>FECHA: {formatDate(sale.date)}</span>
                <span>DOC: #{sale.id.toString().padStart(6, '0')}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                VENDEDOR: {sale.seller || 'Sistema'}
              </div>
            </div>
            
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 8, borderBottom: '1px solid #f0f0f0', paddingBottom: 4 }}>
                <span style={{ flex: 1 }}>Descripción</span>
                <span style={{ width: 40, textAlign: 'center' }}>Cant</span>
                <span style={{ width: 80, textAlign: 'right' }}>Total</span>
              </div>
              {sale.items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', marginBottom: 8, fontSize: '0.85rem', alignItems: 'baseline' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{item.product_name}</div>
                    <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>{formatCurrency(item.price)} x unidad</div>
                  </div>
                  <div style={{ width: 40, textAlign: 'center', fontWeight: 600 }}>{item.quantity}</div>
                  <div style={{ width: 80, textAlign: 'right', fontWeight: 800 }}>{formatCurrency(item.subtotal)}</div>
                </div>
              ))}
            </div>

            <div style={{ borderTop: '2px solid #000', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>TOTAL A PAGAR</span>
                <span className="text-display" style={{ fontWeight: 900, fontSize: '1.4rem' }}>
                  {formatCurrency(sale.total)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', opacity: 0.7 }}>
                <span>MEDIO DE PAGO:</span>
                <span style={{ fontWeight: 700, textTransform: 'uppercase' }}>{sale.paymentMethod || 'Efectivo'}</span>
              </div>
              {sale.paymentMethod === 'efectivo' && sale.cashReceived > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', opacity: 0.7, marginTop: 4 }}>
                    <span>RECIBIDO:</span>
                    <span>{formatCurrency(sale.cashReceived)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', opacity: 0.7 }}>
                    <span>SU VUELTO:</span>
                    <span style={{ fontWeight: 700 }}>{formatCurrency(sale.change)}</span>
                  </div>
                </>
              )}
            </div>

            <div style={{ textAlign: 'center', marginTop: 24, fontSize: '0.75rem', fontStyle: 'italic', opacity: 0.6 }}>
              ¡Gracias por preferir nuestras delicias!<br />
              Vuelva pronto
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
            <button className="btn btn-secondary" onClick={onClose} style={{ height: 50, borderRadius: 'var(--radius-lg)' }}>
              Cerrar
            </button>
            <button className="btn btn-primary" onClick={handlePrint} style={{ height: 50, borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}>
              <Printer size={18} />
              Imprimir Ticket
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
