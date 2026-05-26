import { useState } from 'react';
import { Search, X, Plus, Minus, Clock, ShoppingBag } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export default function AddModal({ show, filteredAvailable, searchProduct, onSearchChange, onAdd, onClose }) {
  const [customQty, setCustomQty] = useState({});

  if (!show) return null;

  const getQty = (productId) => customQty[productId] ?? 1;

  const setQty = (productId, value) => {
    const parsed = parseInt(value);
    setCustomQty(prev => ({ ...prev, [productId]: isNaN(parsed) || parsed < 1 ? 1 : parsed }));
  };

  const increment = (productId) => setQty(productId, getQty(productId) + 1);
  const decrement = (productId) => setQty(productId, getQty(productId) - 1);

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ background: 'rgba(18, 10, 4, 0.65)' }}>
      <div className="modal glass noise-overlay" onClick={e => e.stopPropagation()} style={{
        maxWidth: 520,
        border: 'none',
        boxShadow: 'var(--shadow-xl)',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div className="modal-header" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', padding: '14px var(--space-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              background: 'var(--color-primary)',
              borderRadius: 'var(--radius-md)',
              padding: 7,
              display: 'flex',
            }}>
              <ShoppingBag size={18} color="#fff" />
            </div>
            <div>
              <h2 className="text-display" style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
                Agregar a Vitrina
              </h2>
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                Enteros disponibles para mostrar
              </p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} style={{ background: 'var(--color-bg)', borderRadius: '50%', padding: 6 }}>
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '12px var(--space-lg) 0' }}>
          <div className="search-bar" style={{ maxWidth: '100%' }}>
            <Search className="search-icon" size={16} />
            <input
              type="text"
              placeholder="Buscar producto..."
              value={searchProduct}
              onChange={e => onSearchChange(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Lista */}
        <div className="modal-body" style={{ padding: 'var(--space-md) var(--space-lg)', maxHeight: 420, overflowY: 'auto' }}>
          {filteredAvailable.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-secondary)' }}>
              <ShoppingBag size={36} strokeWidth={1.2} style={{ opacity: 0.2, marginBottom: 8 }} />
              <p style={{ margin: 0, fontSize: '0.9rem' }}>No hay productos disponibles</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredAvailable.map(product => (
                <div key={product.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-lg)',
                  border: '1.5px solid var(--color-border)',
                  background: 'var(--color-bg-card)',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--color-primary)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {/* Foto */}
                  {product.photo
                    ? <img src={product.photo} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', flexShrink: 0 }} />
                    : <div style={{ width: 52, height: 52, borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <ShoppingBag size={20} style={{ opacity: 0.2 }} />
                      </div>
                  }

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {product.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(product.price)}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Clock size={11} />
                        {product.max_showcase_hours || 48}h máx.
                      </span>
                    </div>
                  </div>

                  {/* Cantidad + botón */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {/* Stepper */}
                    <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', height: 36 }}>
                      <button
                        type="button"
                        onClick={() => decrement(product.id)}
                        disabled={getQty(product.id) <= 1}
                        style={{
                          width: 32, height: '100%', border: 'none',
                          background: 'var(--color-bg)',
                          color: getQty(product.id) <= 1 ? 'var(--color-text-light)' : 'var(--color-text)',
                          cursor: getQty(product.id) <= 1 ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: '1rem',
                        }}
                      >
                        <Minus size={13} />
                      </button>
                      <span style={{
                        width: 32, textAlign: 'center',
                        fontWeight: 800, fontSize: '0.95rem',
                        borderLeft: '1px solid var(--color-border)',
                        borderRight: '1px solid var(--color-border)',
                        lineHeight: '36px',
                      }}>
                        {getQty(product.id)}
                      </span>
                      <button
                        type="button"
                        onClick={() => increment(product.id)}
                        style={{
                          width: 32, height: '100%', border: 'none',
                          background: 'var(--color-bg)',
                          color: 'var(--color-text)',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700,
                        }}
                      >
                        <Plus size={13} />
                      </button>
                    </div>

                    <button
                      className="btn btn-primary"
                      onClick={() => onAdd(product, getQty(product.id))}
                      style={{ height: 36, padding: '0 14px', fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap' }}
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
