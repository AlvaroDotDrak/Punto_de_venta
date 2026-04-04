/**
 * StorageWarning — Aviso de persistencia de datos
 * Detecta si el navegador puede borrar los datos del IndexedDB automáticamente
 * y ofrece solicitar almacenamiento persistente con un clic.
 */
import { useState, useEffect } from 'react';
import { HardDrive, X } from 'lucide-react';

const DISMISS_KEY = 'storageWarningDismissed';
const DISMISS_DAYS = 14; // No volver a mostrar por 14 días si el usuario lo cierra

export default function StorageWarning() {
  const [show, setShow] = useState(false);
  const [persisted, setPersisted] = useState(true);
  const [usagePct, setUsagePct] = useState(null);

  useEffect(() => {
    if (!navigator.storage) return;

    // No mostrar si el usuario lo descartó recientemente
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed && Date.now() - parseInt(dismissed) < DISMISS_DAYS * 86400_000) return;

    async function check() {
      try {
        const isPersisted = await navigator.storage.persisted();
        setPersisted(isPersisted);

        if (navigator.storage.estimate) {
          const { usage, quota } = await navigator.storage.estimate();
          if (quota > 0) {
            const pct = usage / quota;
            setUsagePct(Math.round(pct * 100));
            if (pct > 0.8) setShow(true);
          }
        }

        if (!isPersisted) setShow(true);
      } catch {
        // API no disponible o bloqueada por el navegador — no mostrar nada
      }
    }

    check();
  }, []);

  const handlePersist = async () => {
    try {
      const granted = await navigator.storage.persist();
      if (granted) {
        setPersisted(true);
        // Si solo se mostraba por falta de persistencia (no por cuota), ocultar
        if (!usagePct || usagePct <= 80) setShow(false);
      }
    } catch {
      // No se pudo solicitar persistencia
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setShow(false);
  };

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 'var(--space-lg)',
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#FFF3CD',
      border: '1px solid #FFC107',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-sm) var(--space-md)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-sm)',
      zIndex: 9999,
      maxWidth: 560,
      width: 'calc(100vw - 2rem)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    }}>
      <HardDrive size={18} style={{ color: '#856404', flexShrink: 0 }} />

      <div style={{ flex: 1, fontSize: '0.85rem', color: '#856404', lineHeight: 1.4 }}>
        {!persisted && (
          <span>
            El navegador puede borrar los datos automáticamente.{' '}
            <button
              onClick={handlePersist}
              style={{
                color: '#533F03', fontWeight: 600,
                textDecoration: 'underline',
                background: 'none', border: 'none',
                cursor: 'pointer', padding: 0, fontSize: 'inherit',
              }}
            >
              Proteger mis datos
            </button>
            {' '}para uso seguro en modo quiosco.
          </span>
        )}
        {persisted && usagePct > 80 && (
          <span>
            El almacenamiento está al <strong>{usagePct}%</strong> de su capacidad.
            Considera exportar un backup desde Configuración.
          </span>
        )}
      </div>

      <button
        onClick={handleDismiss}
        aria-label="Cerrar aviso"
        style={{
          background: 'none', border: 'none',
          cursor: 'pointer', color: '#856404',
          flexShrink: 0, padding: 2,
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
