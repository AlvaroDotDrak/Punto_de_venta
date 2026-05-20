import { X } from 'lucide-react';

export default function TypeModal({
  product,
  stock,
  onSelect,
  onClose,
}) {
  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ background: 'rgba(18, 10, 4, 0.6)' }}>
      <div className="modal glass noise-overlay" onClick={e => e.stopPropagation()} style={{ 
        maxWidth: 440, 
        border: 'none', 
        boxShadow: 'var(--shadow-xl)',
        borderRadius: 'var(--radius-xl)'
      }}>
        <div className="modal-header" style={{ borderBottom: 'none', padding: 'var(--space-lg) var(--space-lg) 0' }}>
          <button className="modal-close" onClick={onClose} style={{ marginLeft: 'auto', background: 'var(--color-bg)', borderRadius: '50%', padding: 6 }}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '0 var(--space-xl) var(--space-xl)', textAlign: 'center' }}>
          <div style={{ 
            width: 70, 
            height: 70, 
            background: 'var(--color-primary-bg)', 
            color: 'var(--color-primary)', 
            borderRadius: '50%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            margin: '0 auto var(--space-md)',
            fontSize: '2.5rem'
          }}>
            🧁
          </div>
          
          <h2 className="text-display" style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 8 }}>{product.name}</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--space-xl)' }}>
            ¿Cómo deseas vender este producto?
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
            <button
              className="btn btn-secondary"
              onClick={() => onSelect('trozo')}
              style={{
                height: 'auto',
                flexDirection: 'column',
                padding: 'var(--space-lg) var(--space-md)',
                gap: 12,
                borderRadius: 'var(--radius-lg)',
                borderWidth: 1.5,
                background: '#fff'
              }}
            >
              <div style={{ fontSize: '2.8rem', lineHeight: 1 }}>🍰</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--color-text)' }}>Por Trozo</div>
                <div style={{ 
                  fontSize: '0.75rem', 
                  color: stock.trozos > 0 ? 'var(--color-success)' : 'var(--color-primary)', 
                  fontWeight: 600 
                }}>
                  {stock.trozos > 0 ? `${stock.trozos} en stock` : '✨ Auto-trocear'}
                </div>
              </div>
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => onSelect('entero')}
              style={{
                height: 'auto',
                flexDirection: 'column',
                padding: 'var(--space-lg) var(--space-md)',
                gap: 12,
                borderRadius: 'var(--radius-lg)',
                borderWidth: 1.5,
                background: '#fff'
              }}
            >
              <div style={{ fontSize: '2.8rem', lineHeight: 1 }}>🎂</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--color-text)' }}>Torta Entera</div>
                <div style={{ 
                  fontSize: '0.75rem', 
                  color: stock.enteros > 0 ? 'var(--color-success)' : 'var(--color-primary)', 
                  fontWeight: 600 
                }}>
                  {stock.enteros > 0 ? `${stock.enteros} en stock` : '✨ Auto-cargar'}
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
