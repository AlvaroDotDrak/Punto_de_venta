import { X, Printer } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export default function ReceiptModal({ show, lastSale, onClose }) {
  if (!show || !lastSale) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Comprobante de Venta</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="receipt" id="receipt-print">
            <div className="receipt-header">
              <div style={{ fontSize: '1.5rem' }}>🧁</div>
              <strong>PASTELERÍA</strong>
              <br />
              <small>Comprobante de Venta</small>
              <br />
              <small>Venta #{lastSale.id}</small>
            </div>
            <hr className="receipt-divider" />
            <small>{new Date(lastSale.date).toLocaleString('es-CL')}</small>
            <br />
            <small>Vendedor: {lastSale.seller}</small>
            <hr className="receipt-divider" />
            {lastSale.items.map((item, i) => (
              <div key={i} className="receipt-item">
                <span>{item.quantity}x {item.productName}</span>
                <span>{formatCurrency(item.subtotal)}</span>
              </div>
            ))}
            <hr className="receipt-divider" />
            <div className="receipt-total">
              <span>TOTAL</span>
              <span>{formatCurrency(lastSale.total)}</span>
            </div>
            <div className="receipt-item">
              <span>Pago: {lastSale.paymentMethod}</span>
            </div>
            {lastSale.paymentMethod === 'efectivo' && lastSale.cashReceived > 0 && (
              <>
                <div className="receipt-item">
                  <span>Recibido:</span>
                  <span>{formatCurrency(lastSale.cashReceived)}</span>
                </div>
                <div className="receipt-item">
                  <span>Vuelto:</span>
                  <span>{formatCurrency(lastSale.change)}</span>
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
