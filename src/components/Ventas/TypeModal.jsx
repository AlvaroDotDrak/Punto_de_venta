import { X } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export default function TypeModal({ product, stock, onSelect, onClose }) {
  if (!product) return null;
  const slicePrice = product.slice_price ?? Math.round(product.price / (product.slices || 8));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>¿Cómo desea vender?</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <p style={{ textAlign: 'center', marginBottom: 'var(--space-lg)', color: 'var(--color-text-secondary)' }}>
            <strong>{product.name}</strong> tiene enteros y trozos disponibles
          </p>
          <div className="type-options">
            <button className="type-option-btn" onClick={() => onSelect('entero')}>
              <div className="type-icon">🎂</div>
              <div className="type-label">Entero</div>
              <div className="type-price">{formatCurrency(product.price)}</div>
              <div className="type-stock">Stock: {stock.enteros}</div>
            </button>
            <button className="type-option-btn" onClick={() => onSelect('trozo')}>
              <div className="type-icon">🍰</div>
              <div className="type-label">Trozo</div>
              <div className="type-price">{formatCurrency(slicePrice)}</div>
              <div className="type-stock">Stock: {stock.trozos} trozos</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
