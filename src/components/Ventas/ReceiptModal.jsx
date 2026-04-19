import { X, Printer } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export default function ReceiptModal({ sale, onClose }) {
  if (!sale) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Comprobante de Venta</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <div className="receipt" id="receipt-print">
            <div className="receipt-header">
              <div style={{ fontSize: '1.5rem' }}>🧁</div>
              <strong>PASTELERÍA</strong>
              <br />
              <small>Comprobante de Venta</small>
              <br />
              <small>Venta #{sale.id}</small>
            </div>
            <hr className="receipt-divider" />
            <small>{new Date(sale.date).toLocaleString('es-CL')}</small>
            <br />
            <small>Vendedor: {sale.seller}</small>
            <hr className="receipt-divider" />
            {sale.items.map((item, i) => (
              <div key={i} className="receipt-item">
                <span>{item.quantity}x {item.product_name}</span>
                <span>{formatCurrency(item.subtotal)}</span>
              </div>
            ))}
            <hr className="receipt-divider" />
            <div className="receipt-total">
              <span>TOTAL</span>
              <span>{formatCurrency(sale.total)}</span>
            </div>
            <div className="receipt-item">
              <span>Pago: {sale.paymentMethod}</span>
            </div>
            {sale.paymentMethod === 'efectivo' && sale.cashReceived > 0 && (
              <>
                <div className="receipt-item">
                  <span>Recibido:</span>
                  <span>{formatCurrency(sale.cashReceived)}</span>
                </div>
                <div className="receipt-item">
                  <span>Vuelto:</span>
                  <span>{formatCurrency(sale.change)}</span>
                </div>
              </>
            )}
            <hr className="receipt-divider" />
            <div style={{ textAlign: 'center' }}>
              <small>¡Gracias por su compra!</small>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
          <button className="btn btn-primary" onClick={() => window.print()}>
            <Printer size={16} /> Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
