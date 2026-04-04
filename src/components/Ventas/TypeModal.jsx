import { X } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export default function TypeModal({ showTypeModal, onClose, onSelectEntero, onSelectTrozo }) {
  if (!showTypeModal) return null;
  const { product, stock } = showTypeModal;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>¿Cómo desea vender?</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <p style={{ textAlign: 'center', marginBottom: 'var(--space-lg)', color: 'var(--color-text-secondary)' }}>
            <strong>{product.name}</strong> tiene enteros y trozos disponibles
          </p>
          <div className="type-options">
            <button className="type-option-btn" onClick={onSelectEntero}>
              <div className="type-icon">🎂</div>
              <div className="type-label">Entero</div>
              <div className="type-price">{formatCurrency(product.price)}</div>
              <div className="type-stock">Stock: {stock.enteros}</div>
            </button>
            <button className="type-option-btn" onClick={onSelectTrozo}>
              <div className="type-icon">🔪</div>
              <div className="type-label">Trozo</div>
              <div className="type-price">
                {formatCurrency(stock.slicePrice || Math.round(product.price / 6))}
              </div>
              <div className="type-stock">Stock: {stock.trozos} trozos</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
