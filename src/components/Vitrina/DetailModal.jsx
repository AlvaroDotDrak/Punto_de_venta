import { Trash2, X, Ban } from 'lucide-react';
import { getFreshnessStatus, formatElapsedTime, formatDate } from '../../utils/formatters';

function getItemFreshness(item) {
  const effectiveTime = item.showcaseType === 'trozado' && item.slicedAt
    ? item.slicedAt
    : item.placedAt;
  const maxH = item.product?.maxShowcaseHours || 48;
  return {
    status: getFreshnessStatus(effectiveTime, maxH),
    elapsed: formatElapsedTime(effectiveTime),
  };
}

const REMOVAL_REASONS = ['Vencido', 'Dañado', 'Contaminado', 'Calidad deficiente', 'Otro'];

export default function DetailModal({
  show, detailGroup, selectedItems,
  onToggleItem, onToggleAll, onRemoveSelected, onCancelSelected, onClose,
  removeDetailReason, onDetailReasonChange,
  isAdmin,
}) {
  if (!show || !detailGroup) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Detalle: {detailGroup.product.name}</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
            Total en vitrina: <strong>{detailGroup.count}</strong>{' '}
            {detailGroup.showcaseType === 'trozado' ? 'trozos' : 'unidades'}
          </p>
          <div className="detail-items-list">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      onChange={e => onToggleAll(e.target.checked)}
                      checked={selectedItems.length === detailGroup.items.length && detailGroup.items.length > 0}
                    />
                  </th>
                  <th>#</th>
                  <th>{detailGroup.showcaseType === 'trozado' ? 'Trozado' : 'Colocado'}</th>
                  <th>Tiempo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {detailGroup.items.map((item, index) => {
                  const { status, elapsed } = getItemFreshness(item);
                  return (
                    <tr key={item.id} className={`freshness-row-${status}`}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedItems.includes(item.id)}
                          onChange={e => onToggleItem(item.id, e.target.checked)}
                        />
                      </td>
                      <td>{index + 1}</td>
                      <td>{formatDate(detailGroup.showcaseType === 'trozado' ? item.slicedAt : item.placedAt)}</td>
                      <td>{elapsed}</td>
                      <td>
                        {status === 'fresh' && '🟢 Fresco'}
                        {status === 'warning' && '🟡 Precaución'}
                        {status === 'danger' && '🔴 Retirar'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="modal-footer" style={{ flexDirection: 'column', gap: 'var(--space-sm)', alignItems: 'stretch' }}>
          {/* Reason — only shown when retiring (not cancelling) */}
          {selectedItems.length > 0 && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Motivo de retiro (para merma)</label>
              <select
                className="form-input"
                value={removeDetailReason}
                onChange={e => onDetailReasonChange(e.target.value)}
              >
                {REMOVAL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>

            {/* Cancel (admin only) — no merma, no reason needed */}
            {isAdmin && selectedItems.length > 0 && (
              <button className="btn btn-secondary" onClick={onCancelSelected} style={{ color: 'var(--color-text-secondary)' }}>
                <Ban size={16} /> Anular ingreso ({selectedItems.length})
              </button>
            )}

            <button
              className="btn btn-danger"
              onClick={onRemoveSelected}
              disabled={selectedItems.length === 0}
            >
              <Trash2 size={16} /> Retirar como merma ({selectedItems.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
