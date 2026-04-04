import { Scissors, X } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export default function SliceModal({
  show, sliceTarget, sliceCount, slicePrice,
  onSliceCountChange, onSlicePriceChange, onSlice, onClose,
}) {
  if (!show || !sliceTarget) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2><Scissors size={20} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Trozar Producto</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-lg)' }}>
            <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{sliceTarget.product.name}</div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
              Precio entero: {formatCurrency(sliceTarget.product.price)}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Cantidad de trozos</label>
            <div className="slice-counter">
              <button className="btn btn-secondary btn-sm" onClick={() => onSliceCountChange(c => Math.max(2, parseInt(c) - 1).toString())}>−</button>
              <input
                type="number"
                className="form-input"
                value={sliceCount}
                onChange={e => onSliceCountChange(e.target.value)}
                min="2"
                style={{ textAlign: 'center', maxWidth: 80 }}
              />
              <button className="btn btn-secondary btn-sm" onClick={() => onSliceCountChange(c => (parseInt(c) + 1).toString())}>+</button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Precio por trozo ($)</label>
            <input
              type="number"
              className="form-input"
              placeholder="Precio por porción"
              value={slicePrice}
              onChange={e => onSlicePriceChange(e.target.value)}
              min="1"
            />
            <small style={{ color: 'var(--color-text-light)', fontSize: '0.75rem' }}>
              Total esperado: {formatCurrency((parseInt(sliceCount) || 0) * (parseInt(slicePrice) || 0))}
              {' '}(entero: {formatCurrency(sliceTarget.product.price)})
            </small>
          </div>

          <div style={{ background: 'var(--color-bg)', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
            ℹ️ Los trozos tendrán su propio reloj de frescura reiniciado desde el momento del corte ({sliceTarget.product.maxShowcaseHours || 48}h máximo).
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onSlice}>
            <Scissors size={16} /> Trozar en {sliceCount} porciones
          </button>
        </div>
      </div>
    </div>
  );
}
