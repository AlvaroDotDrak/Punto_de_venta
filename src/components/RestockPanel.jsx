import React, { useState } from 'react';
import { formatCurrency } from '../utils/formatters';

export default function RestockPanel({ restockSuggestions, onCopy }) {
  const [showRestockPanel, setShowRestockPanel] = useState(false);

  if (!restockSuggestions || restockSuggestions.length === 0) return null;

  return (
    <div className="card glass noise-overlay animate-slide-up" style={{ border: 'none', background: 'rgba(192, 57, 43, 0.05)', marginBottom: 'var(--space-md)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center' }}>
          <span style={{ fontSize: '1.5rem' }}>⚠️</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Sugerencia de Reabastecimiento</h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
              Hay <strong>{restockSuggestions.length}</strong> insumo(s) bajo el stock mínimo.
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowRestockPanel(!showRestockPanel)}>
            {showRestockPanel ? 'Ocultar Detalle' : 'Ver Detalle'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={onCopy}>
            Copiar Lista
          </button>
        </div>
      </div>

      {showRestockPanel && (
        <div style={{ marginTop: 'var(--space-md)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-sm)' }}>
          <div className="table-wrapper" style={{ margin: 0, boxShadow: 'none', border: '1px solid var(--color-border)' }}>
            <table style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th>Stock Actual</th>
                  <th>Stock Mínimo</th>
                  <th>Sugerido a Comprar</th>
                  <th>Costo Est.</th>
                </tr>
              </thead>
              <tbody>
                {restockSuggestions.map(item => (
                  <tr key={item.ingredient_id}>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td style={{ color: '#C0392B', fontWeight: 600 }}>{item.current_stock} {item.unit}</td>
                    <td>{item.min_stock} {item.unit}</td>
                    <td style={{ color: '#2E8B57', fontWeight: 700 }}>+{item.suggested_qty.toFixed(2)} {item.unit}</td>
                    <td style={{ fontWeight: 600 }}>
                      {item.estimated_cost > 0 ? formatCurrency(item.estimated_cost) : <span style={{ color: 'var(--color-text-light)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--color-bg-card)', fontWeight: 700 }}>
                  <td colSpan={4} style={{ textAlign: 'right', padding: '10px 14px' }}>Presupuesto Total Estimado:</td>
                  <td style={{ color: 'var(--color-primary)', fontSize: '0.9rem', padding: '10px 14px' }}>
                    {formatCurrency(restockSuggestions.reduce((acc, curr) => acc + (curr.estimated_cost || 0), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
