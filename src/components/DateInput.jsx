/**
 * DateInput — input de fecha que muestra DD/MM/AAAA usando el picker nativo.
 * Recibe y entrega valores en formato ISO (YYYY-MM-DD), igual que <input type="date">.
 */
import { useRef } from 'react';

export default function DateInput({ value, onChange, className, id, ...props }) {
  const inputRef = useRef(null);
  const formatted = value ? value.split('-').reverse().join('/') : '';

  const handleClick = () => {
    if (!inputRef.current) return;
    try {
      inputRef.current.showPicker();
    } catch {
      inputRef.current.click();
    }
  };

  return (
    <div style={{ position: 'relative', cursor: 'pointer' }} onClick={handleClick}>
      {/* Texto visible en formato DD/MM/AAAA */}
      <div
        className={className}
        style={{ pointerEvents: 'none', userSelect: 'none', display: 'flex', alignItems: 'center', minHeight: '2.4rem' }}
      >
        {formatted
          ? formatted
          : <span style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>DD/MM/AAAA</span>}
      </div>

      {/* Input nativo invisible — se activa programáticamente al hacer click */}
      <input
        ref={inputRef}
        id={id}
        type="date"
        value={value || ''}
        onChange={onChange}
        style={{ position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none', width: '100%', height: '100%' }}
        {...props}
      />
    </div>
  );
}
