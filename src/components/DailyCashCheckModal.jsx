import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';

export default function DailyCashCheckModal({ info, onDone }) {
  const [amount, setAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const toast = useToast();

  const openDate = info?.open_since
    ? new Date(info.open_since).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  const handleConfirm = async () => {
    const counted = parseFloat(amount);
    if (!amount || isNaN(counted) || counted < 0) {
      toast.error('Ingresa un monto válido');
      return;
    }
    setProcessing(true);
    try {
      await api.post('/cash/daily-handover', { counted_amount: counted });
      toast.success('Cuadre registrado — que tengas un buen día');
      onDone();
    } catch (err) {
      toast.error('Error al registrar: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(18, 10, 4, 0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'var(--space-md)',
    }}>
      <div className="glass noise-overlay" style={{
        width: '100%', maxWidth: 420,
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-xl)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: 'var(--color-bg-sidebar)',
          color: '#fff',
          padding: '20px 24px',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 'var(--radius-md)',
            padding: 10, display: 'flex',
          }}>
            <ClipboardList size={24} />
          </div>
          <div>
            <h2 style={{ fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>Cuadre Diario de Caja</h2>
            <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.6, marginTop: 2 }}>
              Requerido para continuar
            </p>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{
            background: 'var(--color-bg)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            marginBottom: 20,
            border: '1px solid var(--color-border)',
          }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              La caja lleva{' '}
              <strong style={{ color: 'var(--color-text)' }}>
                {info?.days_open === 1 ? '1 día' : `${info?.days_open} días`}
              </strong>{' '}
              abierta desde el{' '}
              <strong style={{ color: 'var(--color-text)' }}>{openDate}</strong>.
            </p>
          </div>

          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 8 }}>
            ¿Cuánto hay en efectivo ahora?
          </label>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <span style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              fontWeight: 800, opacity: 0.4, fontSize: '0.9rem',
            }}>$</span>
            <input
              type="number"
              className="form-input"
              placeholder="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
              min="0"
              style={{ paddingLeft: 26, fontSize: '1.1rem', fontWeight: 700, height: 48 }}
            />
          </div>
          {amount && parseFloat(amount) >= 0 && (
            <p style={{ margin: '0 0 4px', fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
              Este monto será el saldo inicial del día de hoy.
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 24px 20px',
          borderTop: '1px solid rgba(0,0,0,0.06)',
        }}>
          <button
            className={`btn btn-primary ${processing ? 'btn-loading' : ''}`}
            onClick={handleConfirm}
            disabled={processing || !amount || parseFloat(amount) < 0}
            style={{ width: '100%', height: 48, fontSize: '1rem', fontWeight: 800 }}
          >
            {processing ? 'Registrando...' : 'Registrar y continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}
