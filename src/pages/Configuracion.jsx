/**
 * Configuración — Backup, audit log, datos, parámetros
 * V4.0: incluye edición de configuraciones dinámicas
 */
import { useState, useEffect } from 'react';
import { useSeller } from '../context/SellerContext';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import { formatDate } from '../utils/formatters';
import { hexToRgba } from '../utils/verticals';
import {
  Settings, Download, Clock, Shield, Sliders, Store, Upload, Trash2, Check,
  CakeSlice, ClipboardList, Refrigerator, ChefHat, Utensils, Scale, Barcode, Wine, Printer,
} from 'lucide-react';

function resizeImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const maxSize = 256;
        let w = img.width, h = img.height;
        if (w > h) { if (w > maxSize) { h = (h * maxSize) / w; w = maxSize; } }
        else { if (h > maxSize) { w = (w * maxSize) / h; h = maxSize; } }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

const MODULES = [
  { key: 'showcase', label: 'Vitrina (venta por trozo)', description: 'Vende tortas enteras o por trozo desde la vitrina', Icon: CakeSlice },
  { key: 'freshness', label: 'Control de frescura', description: 'Alertas de vencimiento por horas en vitrina', Icon: Clock },
  { key: 'orders', label: 'Pedidos / encargos', description: 'Encargos con abono, saldo y fecha de entrega', Icon: ClipboardList },
  { key: 'cooler_stock', label: 'Control de stock', description: 'Stock físico numérico (bebidas, visicooler)', Icon: Refrigerator },
  { key: 'recipes', label: 'Recetas e insumos', description: 'Ingredientes y descuento por receta', Icon: ChefHat },
  { key: 'tables', label: 'Mesas / comandas', description: 'Gestión de mesas y comandas de salón', Icon: Utensils },
  { key: 'weight_sale', label: 'Venta por peso', description: 'Productos vendidos por kilo o gramaje', Icon: Scale },
  { key: 'barcode', label: 'Código de barras', description: 'Escaneo de productos en el POS', Icon: Barcode },
  { key: 'age_restriction', label: 'Alerta venta de alcohol', description: 'Confirmación de mayoría de edad (18+)', Icon: Wine },
];

export default function Configuracion() {
  const toast = useToast();
  const { currentSeller } = useSeller();
  const { profile, refresh } = useConfig();
  const [testingPrint, setTestingPrint] = useState(false);
  const [activeTab, setActiveTab] = useState('backup');
  const [auditLogs, setAuditLogs] = useState([]);
  const [backupPath, setBackupPath] = useState('');
  const [loadingBackup, setLoadingBackup] = useState(false);
  const [configParams, setConfigParams] = useState({});
  const [savingParam, setSavingParam] = useState(false);
  const [branding, setBranding] = useState(null);
  const [caps, setCaps] = useState(null);
  const [palette, setPalette] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (activeTab === 'audit') {
      api.get('/audit?limit=100').then(setAuditLogs).catch(() => {});
    } else if (activeTab === 'parametros') {
      api.get('/config').then(setConfigParams).catch(() => {});
    } else if (activeTab === 'negocio' && profile) {
      setBranding({ ...profile.branding });
      setCaps({ ...profile.capabilities });
      setPalette(profile.palette);
    }
  }, [activeTab, profile]);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await resizeImage(file);
    setBranding(prev => ({ ...prev, logo: dataUrl }));
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await api.put('/config/profile', { branding, capabilities: caps, palette });
      await refresh();
      toast.success('Configuración del negocio guardada');
    } catch (err) {
      toast.error('Error al guardar: ' + err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleBackup = async () => {
    setLoadingBackup(true);
    try {
      const res = await api.post('/backup/manual');
      setBackupPath(res.path);
      toast.success('Backup guardado en: ' + res.path);
    } catch (err) {
      toast.error('Error al crear backup: ' + err.message);
    } finally {
      setLoadingBackup(false);
    }
  };

  const handleSaveParam = async (key) => {
    setSavingParam(true);
    try {
      await api.put(`/config/${key}`, {
        value: String(configParams[key] ?? ''),
      });
      toast.success('Configuración guardada correctamente');
    } catch (err) {
      toast.error('Error al guardar configuración: ' + err.message);
    } finally {
      setSavingParam(false);
    }
  };

  const handleSavePrinting = async () => {
    setSavingParam(true);
    try {
      await api.put('/config/auto_print', { value: configParams.auto_print === 'true' ? 'true' : 'false' });
      await api.put('/config/printer_name', { value: configParams.printer_name || 'POS-80' });
      await api.put('/config/print_logo', { value: configParams.print_logo === 'true' ? 'true' : 'false' });
      await refresh();
      toast.success('Configuración de impresión guardada');
    } catch (err) {
      toast.error('Error al guardar: ' + err.message);
    } finally {
      setSavingParam(false);
    }
  };

  const handleTestPrint = async () => {
    setTestingPrint(true);
    try {
      await api.post('/print/test');
      toast.success('Ticket de prueba enviado a la impresora');
    } catch (err) {
      toast.error('No se pudo imprimir: ' + err.message);
    } finally {
      setTestingPrint(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><Settings size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />Configuración</h1>
      </div>

      <div className="tabs" style={{ marginBottom: 'var(--space-lg)' }}>
        {[
          ['backup', 'Backup'],
          currentSeller?.role === 'admin' && ['negocio', 'Negocio'],
          currentSeller?.role === 'admin' && ['parametros', 'Parámetros'],
          ['audit', 'Auditoría']
        ].filter(Boolean).map(([key, label]) => (
          <button key={key} className={`tab ${activeTab === key ? 'active' : ''}`} onClick={() => setActiveTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'backup' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title"><Download size={18} /> Backup de datos</h3></div>
          <div className="card-body" style={{ padding: 'var(--space-lg)' }}>
            <p style={{ marginBottom: 'var(--space-md)', color: 'var(--color-text-secondary)' }}>
              Los backups se guardan automáticamente cada 24 horas en <code>~/punto_de_venta_backups/</code>.
              Puedes forzar un backup manual ahora.
            </p>
            <button className="btn btn-primary" onClick={handleBackup} disabled={loadingBackup}>
              {loadingBackup ? <><span className="spinner spinner-sm" /> Generando...</> : <><Download size={16} /> Crear Backup Ahora</>}
            </button>
            {backupPath && (
              <div style={{ marginTop: 'var(--space-md)', color: 'var(--color-success)', fontSize: '0.875rem' }}>
                ✓ Guardado en: {backupPath}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'negocio' && currentSeller?.role === 'admin' && branding && caps && (
        <div className="card">
          <div className="card-header"><h3 className="card-title"><Store size={18} /> Identidad y módulos</h3></div>
          <div className="card-body" style={{ padding: 'var(--space-lg)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', maxWidth: 520 }}>
              <div className="form-group">
                <label className="form-label">Nombre del negocio</label>
                <input className="form-input" value={branding.name || ''}
                  onChange={e => setBranding({ ...branding, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Lema / tagline</label>
                <input className="form-input" value={branding.tagline || ''}
                  onChange={e => setBranding({ ...branding, tagline: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Dirección <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}>(boleta)</span></label>
                  <input className="form-input" value={branding.address || ''}
                    onChange={e => setBranding({ ...branding, address: e.target.value })} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Teléfono</label>
                  <input className="form-input" value={branding.phone || ''}
                    onChange={e => setBranding({ ...branding, phone: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">RUT</label>
                <input className="form-input" value={branding.rut || ''}
                  onChange={e => setBranding({ ...branding, rut: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Mensaje al pie de boleta <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}>(podés usar varias líneas)</span></label>
                <textarea className="form-input" rows={5} value={branding.receipt_footer || ''}
                  placeholder={'¡Gracias por su preferencia!\nVuelva pronto\nSíguenos en Instagram: @tu_negocio'}
                  style={{ resize: 'vertical', fontFamily: "'Courier New', monospace", lineHeight: 1.4 }}
                  onChange={e => setBranding({ ...branding, receipt_footer: e.target.value })} />
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>
                  Cada línea se centra sola en la boleta — no agregues espacios al inicio.
                </p>
              </div>
              <div className="form-group">
                <label className="form-label">Logo del negocio</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                  <div style={{ width: 64, height: 64, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                    {branding.logo
                      ? <img src={branding.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      : <span style={{ fontSize: '1.8rem' }}>{branding.emoji || '🏪'}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                    <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                      <Upload size={14} /> {branding.logo ? 'Cambiar' : 'Subir logo'}
                      <input type="file" accept="image/*" hidden onChange={handleLogoUpload} />
                    </label>
                    {branding.logo && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setBranding({ ...branding, logo: null })} style={{ color: 'var(--color-danger)' }}>
                        <Trash2 size={14} /> Quitar
                      </button>
                    )}
                  </div>
                </div>
                <p style={{ marginTop: 'var(--space-xs)', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                  Si subes un logo, reemplaza al emoji en la barra lateral.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Emoji / logo</label>
                  <input className="form-input" value={branding.emoji || ''} maxLength={4}
                    onChange={e => setBranding({ ...branding, emoji: e.target.value })} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Color principal</label>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', marginTop: 4 }}>
                    {profile.available_palettes?.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        title={p.label}
                        style={{
                          width: 32, height: 32, borderRadius: '50%',
                          border: palette === p.id ? '3px solid var(--color-text)' : '1px solid var(--color-border)',
                          background: p.primary, cursor: 'pointer', padding: 0
                        }}
                        onClick={() => {
                          setPalette(p.id);
                          const root = document.documentElement.style;
                          root.setProperty('--color-primary', p.primary);
                          root.setProperty('--color-primary-light', p.primary_light);
                          root.setProperty('--color-primary-dark', p.primary_dark);
                          root.setProperty('--color-primary-bg', hexToRgba(p.primary, 0.07));
                          root.setProperty('--color-border-focus', p.primary);
                          root.setProperty('--color-accent', p.accent);
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: 600, marginBottom: 2, display: 'block' }}>
                  Módulos activos
                </label>
                <p style={{ marginBottom: 'var(--space-sm)', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                  Activa solo lo que usa tu negocio. Cada módulo enciende su sección en el menú y su lógica en el POS.
                </p>
                <div className="cap-grid">
                  {MODULES.map(({ key, label, description, Icon }) => {
                    const active = !!caps[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`cap-card ${active ? 'active' : ''}`}
                        aria-pressed={active}
                        onClick={() => setCaps(prev => ({ ...prev, [key]: !prev[key] }))}
                      >
                        <span className="cap-card-icon"><Icon size={20} /></span>
                        <span className="cap-card-text">
                          <span className="cap-card-label">{label}</span>
                          <span className="cap-card-desc">{description}</span>
                        </span>
                        <span className="cap-card-check">{active ? <Check size={14} strokeWidth={3} /> : null}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button className="btn btn-primary" onClick={handleSaveProfile} disabled={savingProfile} style={{ alignSelf: 'flex-start' }}>
                {savingProfile ? <><span className="spinner spinner-sm" /> Guardando...</> : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'parametros' && currentSeller?.role === 'admin' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title"><Sliders size={18} /> Parámetros del Sistema</h3></div>
          <div className="card-body" style={{ padding: 'var(--space-lg)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', maxWidth: '500px' }}>
              <div>
                <label className="form-label" style={{ fontWeight: '600', marginBottom: 'var(--space-xs)', display: 'block' }}>
                  Límite alerta vitrina (horas)
                </label>
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  <input
                    type="number"
                    className="form-input"
                    value={configParams.showcase_alert_hours || ''}
                    onChange={(e) => setConfigParams({ ...configParams, showcase_alert_hours: e.target.value })}
                  />
                  <button className="btn btn-primary" onClick={() => handleSaveParam('showcase_alert_hours')} disabled={savingParam}>
                    Guardar
                  </button>
                </div>
                <p style={{ marginTop: 'var(--space-xs)', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                  Tiempo antes de cumplirse el límite de frescura para alertar sobre el vencimiento en vitrina (por defecto 24 horas).
                </p>
              </div>

              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-md)' }}>
                <label className="form-label" style={{ fontWeight: '600', marginBottom: 'var(--space-xs)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Printer size={16} /> Impresión de boletas (térmica)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer', margin: 'var(--space-sm) 0' }}>
                  <input
                    type="checkbox"
                    checked={configParams.auto_print === 'true'}
                    onChange={(e) => setConfigParams({ ...configParams, auto_print: e.target.checked ? 'true' : 'false' })}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.9rem' }}>Imprimir la boleta automáticamente al completar una venta</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer', margin: 'var(--space-sm) 0' }}>
                  <input
                    type="checkbox"
                    checked={configParams.print_logo === 'true'}
                    onChange={(e) => setConfigParams({ ...configParams, print_logo: e.target.checked ? 'true' : 'false' })}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.9rem' }}>Imprimir el logo del negocio en la boleta</span>
                </label>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-sm) 26px' }}>
                  Usa el logo cargado en la pestaña <strong>Negocio</strong>. Funciona mejor con logos simples en blanco y negro.
                </p>
                <label className="form-label" style={{ fontSize: '0.85rem', display: 'block', marginTop: 'var(--space-sm)' }}>
                  Nombre de la impresora (en Windows)
                </label>
                <input
                  className="form-input"
                  value={configParams.printer_name ?? ''}
                  placeholder="POS-80"
                  onChange={(e) => setConfigParams({ ...configParams, printer_name: e.target.value })}
                  style={{ maxWidth: 280 }}
                />
                <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
                  <button className="btn btn-primary" onClick={handleSavePrinting} disabled={savingParam}>
                    Guardar
                  </button>
                  <button className="btn btn-secondary" onClick={handleTestPrint} disabled={testingPrint}>
                    {testingPrint ? <><span className="spinner spinner-sm" /> Imprimiendo...</> : <><Printer size={16} /> Probar impresora</>}
                  </button>
                </div>
                <p style={{ marginTop: 'var(--space-xs)', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                  El botón "Imprimir Ticket" de cada venta sigue disponible para reimprimir manualmente.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title"><Shield size={18} /> Registro de auditoría</h3></div>
          {auditLogs.length > 0 ? (
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Fecha</th><th>Vendedor</th><th>Acción</th><th>Detalle</th></tr></thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr key={log.id}>
                      <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{formatDate(log.created_at)}</td>
                      <td>{log.seller?.name || '—'}</td>
                      <td><span className="badge badge-info">{log.action}</span></td>
                      <td style={{ fontSize: '0.85rem' }}>{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
              <Clock size={32} />
              <p>Sin registros de auditoría</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
