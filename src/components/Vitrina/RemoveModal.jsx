import { Trash2, X } from 'lucide-react';

export default function RemoveModal({
  show, removeGroup, removeQty, removeReason,
  onQtyChange, onReasonChange, onRemove, onClose,
}) {
  if (!show || !removeGroup) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Retirar de Vitrina</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: 'var(--space-md)' }}>
            <strong>{removeGroup.product.name}</strong> — {removeGroup.count} {removeGroup.showcaseType === 'trozado' ? 'trozos' : 'unidades'} disponibles
          </p>

          <div className="form-group">
            <label className="form-label">¿Cuántos retirar?</label>
            <div className="slice-counter">
              <button className="btn btn-secondary btn-sm" onClick={() => onQtyChange(q => Math.max(1, parseInt(q) - 1).toString())}>−</button>
              <input
                type="number"
                className="form-input"
                value={removeQty}
                onChange={e => onQtyChange(e.target.value)}
                min="1"
                max={removeGroup.count}
                style={{ textAlign: 'center', maxWidth: 80 }}
              />
              <button className="btn btn-secondary btn-sm" onClick={() => onQtyChange(q => Math.min(removeGroup.count, parseInt(q) + 1).toString())}>+</button>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-xs)', marginTop: 'var(--space-xs)' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => onQtyChange(removeGroup.count.toString())}>Todos ({removeGroup.count})</button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Motivo de retiro</label>
            <select className="form-input" value={removeReason} onChange={e => onReasonChange(e.target.value)}>
              <option value="Vencido">Vencido</option>
              <option value="Dañado">Dañado</option>
              <option value="Contaminado">Contaminado</option>
              <option value="Calidad deficiente">Calidad deficiente</option>
              <option value="Otro">Otro</option>
            </select>
          </div>

          <div style={{ background: '#fff8e5', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: '#856404' }}>
            ⚠️ Se retirarán los {removeQty} item(s) más antiguos primero.
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-danger" onClick={onRemove}>
            <Trash2 size={16} /> Retirar {removeQty} unidad(es)
          </button>
        </div>
      </div>
    </div>
  );
}
