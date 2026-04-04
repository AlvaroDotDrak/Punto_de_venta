/**
 * ProductInfoTooltip — Shows product description on hover/click
 * V2.1: Displays description, photo, pricing info in a floating tooltip
 */
import { useState, useRef, useEffect } from 'react';
import { formatCurrency } from '../utils/formatters';
import { Info, X } from 'lucide-react';

export default function ProductInfoTooltip({ product }) {
  const [show, setShow] = useState(false);
  const tooltipRef = useRef(null);

  // Close on click outside
  useEffect(() => {
    if (!show) return;
    const handler = (e) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target)) {
        setShow(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [show]);

  if (!product.description) return null;

  return (
    <div
      className="product-info-container"
      ref={tooltipRef}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <button
        className="info-button"
        onClick={(e) => {
          e.stopPropagation();
          setShow(!show);
        }}
        title="Ver información del producto"
      >
        <Info size={14} />
      </button>

      {show && (
        <div className="info-tooltip" onClick={e => e.stopPropagation()}>
          <div className="tooltip-header">
            <h4>{product.name}</h4>
            <button onClick={() => setShow(false)}>
              <X size={14} />
            </button>
          </div>
          <div className="tooltip-content">
            {product.photo && (
              <img src={product.photo} alt={product.name} className="tooltip-image" />
            )}
            <p className="product-description">{product.description}</p>
            <div className="product-details-tags">
              <span className="detail-tag">💰 {formatCurrency(product.price)}</span>
              <span className="detail-tag">⏰ {product.maxShowcaseHours || 48}h máx.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
