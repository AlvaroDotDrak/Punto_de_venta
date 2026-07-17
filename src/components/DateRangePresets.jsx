/**
 * DateRangePresets — atajos de rango de fecha (Hoy, Ayer, Esta semana, Este mes).
 * onSelect recibe (from, to) en formato ISO (YYYY-MM-DD), igual que DateInput.
 */
import { format, subDays, startOfWeek, startOfMonth } from 'date-fns';

const iso = (d) => format(d, 'yyyy-MM-dd');

const PRESETS = [
  { key: 'today',     label: 'Hoy',         range: () => { const t = iso(new Date()); return [t, t]; } },
  { key: 'yesterday', label: 'Ayer',        range: () => { const y = iso(subDays(new Date(), 1)); return [y, y]; } },
  { key: 'week',      label: 'Esta semana', range: () => [iso(startOfWeek(new Date(), { weekStartsOn: 1 })), iso(new Date())] },
  { key: 'month',     label: 'Este mes',    range: () => [iso(startOfMonth(new Date())), iso(new Date())] },
];

export default function DateRangePresets({ from, to, onSelect, minDate, style }) {
  const clamp = ([f, t]) => [minDate && f < minDate ? minDate : f, t];

  return (
    <div className="quick-filters" style={style}>
      {PRESETS.map(p => {
        const [f, t] = clamp(p.range());
        const active = from === f && to === t;
        return (
          <button
            key={p.key}
            type="button"
            className={`quick-filter ${active ? 'active' : ''}`}
            onClick={() => onSelect(f, t)}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
