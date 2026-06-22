/**
 * SetupWizard — Onboarding de una instancia nueva.
 * Paso 1: elegir rubro. Paso 2: nombre del negocio + admin. Paso 3: PIN admin.
 * Al terminar llama POST /api/setup y recarga la configuración.
 */
import { useState } from 'react';
import api from '../utils/api';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { VERTICAL_OPTIONS, PALETTES, hexToRgba } from '../utils/verticals';
import { Lock, AlertTriangle, ArrowLeft, Check } from 'lucide-react';

export default function SetupWizard() {
  const { refresh } = useConfig();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [businessType, setBusinessType] = useState(null);
  const [businessName, setBusinessName] = useState('');
  const [adminName, setAdminName] = useState('Admin');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [palette, setPalette] = useState(null);

  const selectVertical = (v) => {
    setBusinessType(v.value);
    setBusinessName(prev => prev || v.label);
    setPalette(v.defaultPalette);
    setStep(2);
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError('');
    if (pin.length < 4) { setError('El PIN debe tener al menos 4 dígitos'); return; }
    if (pin !== pinConfirm) { setError('Los PIN no coinciden'); return; }

    setSaving(true);
    try {
      await api.post('/setup', {
        business_type: businessType,
        business_name: businessName.trim() || 'Mi Negocio',
        admin_name: adminName.trim() || 'Admin',
        admin_pin: pin,
        palette: palette,
      });
      await refresh();
      toast.success('¡Sistema configurado! Ingresa con tu PIN.');
      // El cambio de setup_complete re-renderiza App hacia el login
    } catch (err) {
      setError(err.message || 'No se pudo completar la configuración');
      setSaving(false);
    }
  };

  // Paso 1 — elegir rubro
  if (step === 1) {
    return (
      <div className="login-screen">
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: 'var(--space-sm)' }}>🛠️</div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', marginBottom: 'var(--space-xs)' }}>
            Configura tu negocio
          </h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Elige el rubro para empezar
          </p>
        </div>

        <div className="seller-grid" style={{ maxWidth: 720 }}>
          {VERTICAL_OPTIONS.map(v => (
            <button key={v.value} className="seller-btn" onClick={() => selectVertical(v)}>
              <div className="seller-avatar" style={{ fontSize: '1.8rem' }}>{v.emoji}</div>
              <span className="seller-name">{v.label}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-light)', textAlign: 'center' }}>
                {v.description}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Paso 2 — nombre del negocio
  if (step === 2) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <button className="btn btn-ghost btn-sm login-back" onClick={() => setStep(1)}>
            <ArrowLeft size={16} /> Volver
          </button>
          <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-lg)', fontFamily: 'var(--font-heading)' }}>
            Datos del negocio
          </h2>
          <form onSubmit={(e) => { e.preventDefault(); if (businessName.trim()) setStep(3); }}>
            <div className="form-group">
              <label className="form-label">Nombre del negocio</label>
              <input className="form-input" value={businessName} autoFocus
                onChange={e => setBusinessName(e.target.value)} placeholder="Ej: Pastelería Tía Julia" />
            </div>
            <div className="form-group">
              <label className="form-label">Nombre del administrador</label>
              <input className="form-input" value={adminName}
                onChange={e => setAdminName(e.target.value)} placeholder="Admin" />
            </div>
            <div className="form-group" style={{ marginTop: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
              <label className="form-label">Color del negocio</label>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                {VERTICAL_OPTIONS.find(v => v.value === businessType)?.palettes.map(id => {
                  const p = PALETTES[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      title={p.label}
                      style={{
                        width: 32, height: 32, borderRadius: '50%',
                        border: palette === id ? '3px solid var(--color-text)' : '1px solid var(--color-border)',
                        background: p.primary, cursor: 'pointer', padding: 0
                      }}
                      onClick={() => {
                        setPalette(id);
                        const root = document.documentElement.style;
                        root.setProperty('--color-primary', p.primary);
                        root.setProperty('--color-primary-light', p.primary_light);
                        root.setProperty('--color-primary-dark', p.primary_dark);
                        root.setProperty('--color-primary-bg', hexToRgba(p.primary, 0.07));
                        root.setProperty('--color-border-focus', p.primary);
                        root.setProperty('--color-accent', p.accent);
                      }}
                    />
                  );
                })}
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }}
              disabled={!businessName.trim()}>
              Continuar
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Paso 3 — PIN del administrador
  return (
    <div className="login-screen">
      <div className="login-card">
        <button className="btn btn-ghost btn-sm login-back" onClick={() => { setStep(2); setError(''); }}>
          <ArrowLeft size={16} /> Volver
        </button>
        <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-xs)', fontFamily: 'var(--font-heading)' }}>
          Crea tu PIN de administrador
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--space-lg)' }}>
          Lo usarás para ingresar al sistema
        </p>

        <form onSubmit={handleSubmit}>
          <div className="pin-input-group">
            <Lock size={18} className="pin-icon" />
            <input type="password" className="pin-input" placeholder="PIN (4-6 dígitos)" value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6} autoFocus inputMode="numeric" pattern="[0-9]*" />
          </div>
          <div className="pin-input-group" style={{ marginTop: 'var(--space-sm)' }}>
            <Lock size={18} className="pin-icon" />
            <input type="password" className="pin-input" placeholder="Repetir PIN" value={pinConfirm}
              onChange={e => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6} inputMode="numeric" pattern="[0-9]*" />
          </div>

          {error && (
            <div className="pin-error">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: 'var(--space-md)' }}
            disabled={!pin || !pinConfirm || saving}>
            {saving ? <><span className="spinner spinner-sm" /> Configurando...</> : <><Check size={18} /> Finalizar</>}
          </button>
        </form>
      </div>
    </div>
  );
}
