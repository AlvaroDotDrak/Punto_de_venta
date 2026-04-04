import { X, Clock } from 'lucide-react';

const QUICK_OPTIONS = [1, 2, 4, 8];

export default function ExtendModal({
  show, extendTarget, extendHours, onExtendHoursChange, onExtend, onClose,
}) {
  if (!show || !extendTarget) return null;

  const baseMaxH = extendTarget.product.maxShowcaseHours || 48;
  const currentExtra = extendTarget.oldestItem.extendedHours || 0;
  const capRemaining = baseMaxH - currentExtra;
  const hours = parseInt(extendHours) || 0;
  const newTotalMax = baseMaxH + currentExtra + hours;
  const exceedsCap = currentExtra + hours > baseMaxH;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2><Clock size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />Extender tiempo en vitrina</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: 'var(--space-md)' }}>
            <strong>{extendTarget.product.name}</strong> —{' '}
            {extendTarget.count} {extendTarget.showcaseType === 'trozado' ? 'trozos' : 'unidades'}
          </p>

          {/* Current status */}
          <div style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-sm) var(--space-md)',
            marginBottom: 'var(--space-md)',
            fontSize: '0.875rem',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}>
            <div>
              Duración original: <strong>{baseMaxH}h</strong>
            </div>
            {currentExtra > 0 && (
              <div>
                Ya extendido: <strong style={{ color: 'var(--color-primary)' }}>+{currentExtra}h</strong>
              </div>
            )}
            <div>
              Extensión disponible: <strong>{Math.max(0, capRemaining)}h más</strong>
              {capRemaining <= 0 && (
                <span style={{ color: 'var(--color-danger)', marginLeft: 6 }}>— límite alcanzado</span>
              )}
            </div>
          </div>

          {capRemaining > 0 ? (
            <>
              {/* Quick options */}
              <div className="form-group">
                <label className="form-label">Extender por</label>
                <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
                  {QUICK_OPTIONS.map(h => (
                    <button
                      key={h}
                      className={`btn btn-sm ${extendHours === h ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => onExtendHoursChange(h)}
                      disabled={currentExtra + h > baseMaxH}
                    >
                      +{h}h
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom input */}
              <div className="form-group">
                <label className="form-label">Horas personalizadas (máx +{capRemaining}h)</label>
                <input
                  type="number"
                  className="form-input"
                  value={extendHours}
                  onChange={e => onExtendHoursChange(parseInt(e.target.value) || 0)}
                  min={1}
                  max={capRemaining}
                  style={{ maxWidth: 100 }}
                />
              </div>

              {/* Preview */}
              {hours > 0 && !exceedsCap && (
                <div style={{
                  background: 'var(--color-success-bg)',
                  border: '1px solid var(--color-success)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 'var(--space-sm) var(--space-md)',
                  fontSize: '0.875rem',
                  color: 'var(--color-success)',
                }}>
                  Nueva duración máxima: <strong>{newTotalMax}h</strong>
                </div>
              )}

              {exceedsCap && (
                <div style={{
                  background: 'var(--color-danger-bg)',
                  border: '1px solid var(--color-danger)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 'var(--space-sm) var(--space-md)',
                  fontSize: '0.875rem',
                  color: 'var(--color-danger)',
                }}>
                  ⚠️ Máximo +{capRemaining}h adicionales permitidos
                </div>
              )}
            </>
          ) : (
            <div style={{
              background: 'var(--color-danger-bg)',
              border: '1px solid var(--color-danger)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-sm) var(--space-md)',
              fontSize: '0.875rem',
              color: 'var(--color-danger)',
            }}>
              Este producto ya alcanzó el límite máximo de extensión (+{baseMaxH}h).
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={onExtend}
            disabled={exceedsCap || hours <= 0 || capRemaining <= 0}
          >
            <Clock size={16} /> Extender +{hours}h
          </button>
        </div>
      </div>
    </div>
  );
}
