import { useState, useRef, useMemo } from 'react';
import { Search, Plus, Package, Wheat } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

/**
 * Buscador con autocompletado para elegir un producto o insumo en una línea de compra.
 * Si lo buscado no existe, ofrece crearlo al vuelo (onCreate).
 */
export default function ItemPicker({ kind, items, value, onSelect, onCreate }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimer = useRef(null);

  const selected = useMemo(
    () => items.find(i => String(i.id) === String(value)),
    [items, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 50);
    return items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (kind === 'product' && i.barcode && i.barcode.includes(q))
    ).slice(0, 50);
  }, [items, query, kind]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !!q && items.some(i => i.name.toLowerCase() === q);
  }, [items, query]);

  const Icon = kind === 'product' ? Package : Wheat;

  const meta = (i) => {
    if (kind === 'product') {
      const parts = [];
      if (i.stock != null) parts.push(`stock ${i.stock}`);
      if (i.cost_price) parts.push(`costo ${formatCurrency(i.cost_price)}`);
      return parts.join(' · ');
    }
    const parts = [`${i.current_stock ?? 0} ${i.unit}`];
    if (i.last_price) parts.push(`costo ${formatCurrency(i.last_price)}`);
    return parts.join(' · ');
  };

  const handleSelect = (item) => {
    onSelect(String(item.id));
    setQuery('');
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}
      onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 120); }}
      onFocus={() => { if (blurTimer.current) clearTimeout(blurTimer.current); }}>
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', pointerEvents: 'none' }} />
        <input
          className="form-input form-input-sm"
          style={{ paddingLeft: 28, width: '100%' }}
          value={open ? query : (selected?.name || '')}
          placeholder={selected ? '' : 'Buscar...'}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setQuery(''); setOpen(true); }}
        />
      </div>
      {open && (
        <div className="item-picker-dropdown">
          {filtered.map(i => (
            <button type="button" key={i.id} className="item-picker-option"
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleSelect(i)}>
              <Icon size={14} style={{ flexShrink: 0, color: 'var(--color-text-secondary)' }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 500 }}>{i.name}</span>
                {meta(i) && <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>{meta(i)}</span>}
              </span>
            </button>
          ))}
          {query.trim() && !exactMatch && (
            <button type="button" className="item-picker-option item-picker-create"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onCreate(query.trim()); setOpen(false); setQuery(''); }}>
              <Plus size={14} /> Crear «{query.trim()}»
            </button>
          )}
          {filtered.length === 0 && !query.trim() && (
            <div className="item-picker-empty">Escribe para buscar…</div>
          )}
        </div>
      )}
    </div>
  );
}
