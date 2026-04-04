/**
 * SellerSelect — Login screen with PIN authentication
 * Features: PIN input, 3-attempt lockout, audit logging
 */
import { useEffect, useState } from 'react';
import db from '../db';
import { useSeller } from '../context/SellerContext';
import { verifyPin } from '../utils/crypto';
import { logAction, ACTIONS } from '../utils/auditLog';
import { User, Lock, AlertTriangle, ArrowLeft } from 'lucide-react';

const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes

export default function SellerSelect() {
  const [sellers, setSellers] = useState([]);
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState({});
  const [lockouts, setLockouts] = useState({});
  const [verifying, setVerifying] = useState(false);
  const { selectSeller } = useSeller();

  useEffect(() => {
    db.sellers.toArray().then(all => {
      setSellers(all.filter(s => s.active !== false));
    });
  }, []);

  // Check lockout status
  const isLocked = (sellerId) => {
    const lockTime = lockouts[sellerId];
    if (!lockTime) return false;
    if (Date.now() - lockTime < LOCKOUT_DURATION) return true;
    // Lockout expired
    setLockouts(prev => { const n = { ...prev }; delete n[sellerId]; return n; });
    setAttempts(prev => { const n = { ...prev }; delete n[sellerId]; return n; });
    return false;
  };

  const getRemainingLockout = (sellerId) => {
    const lockTime = lockouts[sellerId];
    if (!lockTime) return 0;
    const remaining = LOCKOUT_DURATION - (Date.now() - lockTime);
    return Math.max(0, Math.ceil(remaining / 1000));
  };

  const handleSellerClick = (seller) => {
    if (isLocked(seller.id)) return;
    
    // If seller has no PIN, log in directly
    if (!seller.pin) {
      logAction(ACTIONS.LOGIN, seller.id, `${seller.name} ingresó (sin PIN)`);
      selectSeller(seller);
      return;
    }
    
    setSelectedSeller(seller);
    setPin('');
    setError('');
  };

  const handlePinSubmit = async (e) => {
    e?.preventDefault();
    if (!selectedSeller || !pin || verifying) return;

    setVerifying(true);
    setError('');

    try {
      const isValid = await verifyPin(pin, selectedSeller.pin);

      if (isValid) {
        await logAction(ACTIONS.LOGIN, selectedSeller.id, `${selectedSeller.name} ingresó correctamente`);
        setAttempts(prev => { const n = { ...prev }; delete n[selectedSeller.id]; return n; });
        selectSeller(selectedSeller);
      } else {
        const newAttempts = (attempts[selectedSeller.id] || 0) + 1;
        setAttempts(prev => ({ ...prev, [selectedSeller.id]: newAttempts }));

        if (newAttempts >= MAX_ATTEMPTS) {
          setLockouts(prev => ({ ...prev, [selectedSeller.id]: Date.now() }));
          await logAction(ACTIONS.LOGIN_LOCKED, selectedSeller.id, `${selectedSeller.name} bloqueado tras ${MAX_ATTEMPTS} intentos fallidos`);
          setError(`🔒 Cuenta bloqueada por 5 minutos`);
          setSelectedSeller(null);
        } else {
          await logAction(ACTIONS.LOGIN_FAILED, selectedSeller.id, `Intento ${newAttempts}/${MAX_ATTEMPTS}`);
          setError(`PIN incorrecto (intento ${newAttempts}/${MAX_ATTEMPTS})`);
        }
        setPin('');
      }
    } catch (err) {
      setError('Error de verificación: ' + err.message);
    } finally {
      setVerifying(false);
    }
  };

  const remainingAttempts = (sellerId) => MAX_ATTEMPTS - (attempts[sellerId] || 0);

  // PIN entry screen
  if (selectedSeller) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <button className="btn btn-ghost btn-sm login-back" onClick={() => { setSelectedSeller(null); setPin(''); setError(''); }}>
            <ArrowLeft size={16} /> Volver
          </button>
          
          <div className="seller-avatar" style={{ width: 80, height: 80, fontSize: '2rem', margin: '0 auto var(--space-md)' }}>
            {selectedSeller.name.charAt(0).toUpperCase()}
          </div>
          <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-xs)', fontFamily: 'var(--font-heading)' }}>
            {selectedSeller.name}
          </h2>
          <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--space-lg)' }}>
            Ingresa tu PIN para continuar
          </p>

          <form onSubmit={handlePinSubmit}>
            <div className="pin-input-group">
              <Lock size={18} className="pin-icon" />
              <input
                type="password"
                className="pin-input"
                placeholder="••••"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                autoFocus
                inputMode="numeric"
                pattern="[0-9]*"
              />
            </div>

            {error && (
              <div className="pin-error">
                <AlertTriangle size={14} />
                {error}
              </div>
            )}

            <div className="attempt-dots">
              {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                <span
                  key={i}
                  className={`attempt-dot ${i < (attempts[selectedSeller.id] || 0) ? 'failed' : ''}`}
                />
              ))}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
              disabled={!pin || verifying}
            >
              {verifying ? (
                <><span className="spinner spinner-sm" /> Verificando...</>
              ) : (
                <>🔓 Ingresar</>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Seller selection screen
  return (
    <div className="login-screen">
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
        <div style={{ fontSize: '4rem', marginBottom: 'var(--space-md)' }}>🧁</div>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', marginBottom: 'var(--space-xs)' }}>
          Pastelería
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1rem' }}>
          Selecciona tu usuario para comenzar
        </p>
      </div>

      <div className="seller-grid">
        {sellers.map(seller => {
          const locked = isLocked(seller.id);
          const remaining = getRemainingLockout(seller.id);
          return (
            <button
              key={seller.id}
              className={`seller-btn ${locked ? 'locked' : ''}`}
              onClick={() => handleSellerClick(seller)}
              disabled={locked}
            >
              <div className="seller-avatar">
                {locked ? <Lock size={24} /> : seller.name.charAt(0).toUpperCase()}
              </div>
              <span className="seller-name">{seller.name}</span>
              {locked && (
                <span className="lockout-notice">
                  Bloqueado ({Math.floor(remaining / 60)}:{(remaining % 60).toString().padStart(2, '0')})
                </span>
              )}
              {seller.pin && !locked && (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                  🔒 PIN requerido
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
