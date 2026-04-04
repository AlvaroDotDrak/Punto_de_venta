import { useState } from 'react';
import { Search, X, Plus } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export default function AddModal({ show, filteredAvailable, searchProduct, onSearchChange, onAdd, onClose }) {
  const [customQty, setCustomQty] = useState({});

  if (!show) return null;

  const getQty = (productId) => customQty[productId] ?? 1;

  const setQty = (productId, value) => {
    const parsed = parseInt(value);
    setCustomQty(prev => ({ ...prev, [productId]: isNaN(parsed) || parsed < 1 ? 1 : parsed }));
  };

  const handleAdd = (product) => {
    onAdd(product, getQty(product.id));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Agregar a Vitrina (Entero)</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="search-bar" style={{ maxWidth: '100%', marginBottom: 'var(--space-md)' }}>
            <Search className="search-icon" size={18} />
            <input
              type="text"
              placeholder="Buscar producto..."
              value={searchProduct}
              onChange={e => onSearchChange(e.target.value)}
              autoFocus
            />
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {filteredAvailable.map(product => (
              <div key={product.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: 'var(--space-sm) var(--space-md)',
                borderBottom: '1px solid var(--color-border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  {product.photo ? <img src={product.photo} alt="" className="product-thumb" /> : null}
                  <div>
                    <div style={{ fontWeight: 500 }}>{product.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                      {formatCurrency(product.price)} · Máx vitrina: {product.maxShowcaseHours || 48}h
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={getQty(product.id)}
                    onChange={e => setQty(product.id, e.target.value)}
                    onClick={e => e.target.select()}
                    style={{
                      width: 56,
                      textAlign: 'center',
                      padding: '4px 6px',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.9rem',
                    }}
                  />
                  <button className="btn btn-primary btn-sm" onClick={() => handleAdd(product)}>
                    <Plus size={14} /> Agregar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
