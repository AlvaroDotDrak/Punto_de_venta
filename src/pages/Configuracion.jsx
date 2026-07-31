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
  Tag, Plus,
} from 'lucide-react';

// Arquetipos de categoría: traducen los flags técnicos (showcase/sliceable/stock)
// a opciones entendibles para el dueño del negocio.
const CATEGORY_TYPES = [
  { id: 'simple', label: 'Simple', desc: 'Se vende por unidad. Sin inventario ni vitrina.', flags: {} },
  { id: 'stock', label: 'Con inventario', desc: 'Controla stock numérico (bebidas, congelados).', flags: { stock: true } },
  { id: 'showcase', label: 'Vitrina', desc: 'Va a la vitrina con control de frescura.', flags: { showcase: true } },
  { id: 'showcase_sliceable', label: 'Vitrina por trozo', desc: 'Vitrina + venta por trozo (tortas).', flags: { showcase: true, sliceable: true }, requires: 'showcase' },
];

function archetypeOf(cat) {
  if (cat.sliceable) return 'showcase_sliceable';
  if (cat.showcase) return 'showcase';
  if (cat.stock) return 'stock';
  return 'simple';
}

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

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
  const isAdmin = ['admin', 'dev'].includes(currentSeller?.role);
  const { profile, refresh } = useConfig();
  const [testingPrint, setTestingPrint] = useState(false);
  const [activeTab, setActiveTab] = useState('backup');
  const [auditLogs, setAuditLogs] = useState([]);
  const [backupPath, setBackupPath] = useState('');
  const [loadingBackup, setLoadingBackup] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);       // { name, data }
  const [restoreError, setRestoreError] = useState('');
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [configParams, setConfigParams] = useState({});
  const [savingParam, setSavingParam] = useState(false);
  const [cashTolerance, setCashTolerance] = useState('');
  const [branding, setBranding] = useState(null);
  const [caps, setCaps] = useState(null);
  const [palette, setPalette] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [cats, setCats] = useState(null);
  const [catUsage, setCatUsage] = useState({});
  const [savingCats, setSavingCats] = useState(false);

  useEffect(() => {
    if (activeTab === 'audit') {
      api.get('/audit?limit=100').then(setAuditLogs).catch(() => {});
    } else if (activeTab === 'parametros') {
      api.get('/config').then(setConfigParams).catch(() => {});
      setCashTolerance(String(profile?.cash_diff_tolerance ?? 500));
    } else if (activeTab === 'negocio' && profile) {
      setBranding({ ...profile.branding });
      setCaps({ ...profile.capabilities });
      setPalette(profile.palette);
    } else if (activeTab === 'categorias' && profile) {
      setCats((profile.product_categories || []).map(c => ({
        value: c.value, label: c.label, emoji: c.emoji || '', type: archetypeOf(c),
      })));
      api.get('/products?active_only=false')
        .then(prods => {
          const usage = {};
          for (const p of prods) usage[p.category] = (usage[p.category] || 0) + 1;
          setCatUsage(usage);
        })
        .catch(() => setCatUsage({}));
    }
  }, [activeTab, profile]);

  const updateCat = (i, patch) => setCats(prev => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  const addCat = () => setCats(prev => [...prev, { value: '', label: '', emoji: '', type: 'simple' }]);
  const removeCat = (i) => {
    const c = cats[i];
    if (c.value && catUsage[c.value] > 0) {
      toast.error(`No se puede eliminar: ${catUsage[c.value]} producto(s) usan esta categoría`);
      return;
    }
    setCats(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleSaveCats = async () => {
    if (cats.length === 0) {
      toast.error('Debe haber al menos una categoría');
      return;
    }
    if (cats.some(c => !c.label.trim())) {
      toast.error('Cada categoría necesita un nombre');
      return;
    }
    // Resolver value: las existentes conservan el suyo; las nuevas se generan del nombre
    const used = new Set();
    const payload = [];
    for (const c of cats) {
      let value = c.value || slugify(c.label);
      if (!value) value = 'cat';
      let unique = value, n = 2;
      while (used.has(unique)) unique = `${value}_${n++}`;
      used.add(unique);
      const flags = CATEGORY_TYPES.find(t => t.id === c.type)?.flags || {};
      payload.push({
        value: unique,
        label: c.label.trim(),
        emoji: c.emoji.trim(),
        showcase: !!flags.showcase,
        sliceable: !!flags.sliceable,
        stock: !!flags.stock,
      });
    }
    setSavingCats(true);
    try {
      await api.put('/config/profile', { product_categories: payload });
      await refresh();
      toast.success('Categorías guardadas');
    } catch (err) {
      toast.error('Error al guardar: ' + err.message);
    } finally {
      setSavingCats(false);
    }
  };

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

  const handleRestoreFileSelect = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo si se cancela
    if (!file) return;
    setRestoreError('');
    setRestoreFile(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data || typeof data !== 'object' || !Array.isArray(data.sellers)) {
          setRestoreError('El archivo no parece ser un backup válido de este sistema.');
          return;
        }
        setRestoreFile({ name: file.name, data });
      } catch {
        setRestoreError('No se pudo leer el archivo: no es un JSON válido.');
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmRestore = async () => {
    if (!restoreFile || restoreConfirmText !== 'RESTAURAR') return;
    setRestoring(true);
    try {
      await api.post('/backup/restore?confirm=true', restoreFile.data);
      toast.success('Backup restaurado. Recargando...');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast.error('Error al restaurar: ' + err.message);
      setRestoring(false);
    }
  };

  const handleSaveTolerance = async () => {
    const value = parseInt(cashTolerance);
    if (isNaN(value) || value < 0) { toast.error('La tolerancia debe ser un número positivo o cero'); return; }
    setSavingParam(true);
    try {
      await api.put('/config/profile', { cash_diff_tolerance: value });
      await refresh();
      toast.success('Tolerancia de caja guardada');
    } catch (err) {
      toast.error('Error al guardar: ' + err.message);
    } finally {
      setSavingParam(false);
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
          isAdmin && ['negocio', 'Negocio'],
          isAdmin && ['categorias', 'Categorías'],
          isAdmin && ['parametros', 'Parámetros'],
          ['audit', 'Auditoría']
        ].filter(Boolean).map(([key, label]) => (
          <button key={key} className={`tab ${activeTab === key ? 'active' : ''}`} onClick={() => setActiveTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'backup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
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

          {isAdmin && (
            <div className="card">
              <div className="card-header"><h3 className="card-title"><Upload size={18} /> Restaurar backup</h3></div>
              <div className="card-body" style={{ padding: 'var(--space-lg)' }}>
                <p style={{ marginBottom: 'var(--space-md)', color: 'var(--color-text-secondary)' }}>
                  Reemplaza <strong>todos</strong> los datos actuales (ventas, productos, caja, gastos, etc.)
                  por los de un archivo <code>backup_*.json</code>. Esta acción no se puede deshacer.
                </p>

                <input
                  type="file"
                  accept="application/json"
                  onChange={handleRestoreFileSelect}
                  style={{ marginBottom: 'var(--space-sm)' }}
                />

                {restoreError && (
                  <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: 'var(--space-sm)' }}>
                    {restoreError}
                  </div>
                )}

                {restoreFile && (
                  <div style={{
                    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)', padding: 'var(--space-md)',
                    marginBottom: 'var(--space-md)', fontSize: '0.85rem',
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{restoreFile.name}</div>
                    <div style={{ color: 'var(--color-text-secondary)' }}>
                      Exportado: {restoreFile.data.exported_at ? formatDate(restoreFile.data.exported_at) : '—'}
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', marginTop: 6 }}>
                      <span>👥 {restoreFile.data.sellers?.length ?? 0} vendedores</span>
                      <span>📦 {restoreFile.data.products?.length ?? 0} productos</span>
                      <span>🧾 {restoreFile.data.sales?.length ?? 0} ventas</span>
                      <span>💸 {restoreFile.data.expenses?.length ?? 0} gastos</span>
                    </div>
                  </div>
                )}

                <button
                  className="btn btn-danger"
                  disabled={!restoreFile}
                  onClick={() => { setRestoreConfirmText(''); setShowRestoreConfirm(true); }}
                >
                  <Upload size={16} /> Restaurar este backup
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showRestoreConfirm && (
        <div className="modal-overlay" onClick={() => !restoring && setShowRestoreConfirm(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>⚠️ Restaurar backup</h3></div>
            <div className="modal-body">
              <p>
                Esto <strong>borrará todos los datos actuales</strong> y los reemplazará por los del
                archivo <strong>{restoreFile?.name}</strong>. No se puede deshacer.
              </p>
              <p style={{ marginTop: 'var(--space-sm)' }}>
                Escribe <strong>RESTAURAR</strong> para confirmar:
              </p>
              <input
                className="form-input"
                value={restoreConfirmText}
                onChange={e => setRestoreConfirmText(e.target.value)}
                placeholder="RESTAURAR"
                autoFocus
                style={{ marginTop: 'var(--space-sm)' }}
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" disabled={restoring} onClick={() => setShowRestoreConfirm(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                disabled={restoreConfirmText !== 'RESTAURAR' || restoring}
                onClick={handleConfirmRestore}
              >
                {restoring ? <><span className="spinner spinner-sm" /> Restaurando...</> : 'Sí, restaurar y reemplazar todo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'negocio' && isAdmin && branding && caps && (
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

              {currentSeller?.role === 'dev' && (
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
              )}

              <button className="btn btn-primary" onClick={handleSaveProfile} disabled={savingProfile} style={{ alignSelf: 'flex-start' }}>
                {savingProfile ? <><span className="spinner spinner-sm" /> Guardando...</> : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'categorias' && isAdmin && cats && (
        <div className="card">
          <div className="card-header"><h3 className="card-title"><Tag size={18} /> Categorías de producto</h3></div>
          <div className="card-body" style={{ padding: 'var(--space-lg)' }}>
            <p style={{ marginBottom: 'var(--space-md)', fontSize: '0.85rem', color: 'var(--color-text-secondary)', maxWidth: 640 }}>
              Crea las categorías con las que organizas tus productos. El <strong>tipo</strong> define cómo se comporta cada una
              en el punto de venta. Una categoría con productos no se puede eliminar.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', maxWidth: 720 }}>
              {cats.map((c, i) => {
                const inUse = c.value && catUsage[c.value] > 0;
                return (
                  <div key={i} style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-start', padding: 'var(--space-sm)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)' }}>
                    <input
                      className="form-input"
                      value={c.emoji}
                      maxLength={4}
                      placeholder="🏷️"
                      onChange={e => updateCat(i, { emoji: e.target.value })}
                      style={{ width: 56, textAlign: 'center', fontSize: '1.2rem', flexShrink: 0 }}
                      aria-label="Emoji"
                    />
                    <div className="form-group" style={{ flex: 1, margin: 0 }}>
                      <input
                        className="form-input"
                        value={c.label}
                        placeholder="Nombre (ej. Ceviches)"
                        onChange={e => updateCat(i, { label: e.target.value })}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1, margin: 0 }}>
                      <select className="form-select" value={c.type} onChange={e => updateCat(i, { type: e.target.value })}>
                        {CATEGORY_TYPES.map(t => {
                          const blocked = t.requires && !profile.capabilities?.[t.requires];
                          return (
                            <option key={t.id} value={t.id} disabled={blocked}>
                              {t.label}{blocked ? ' (módulo desactivado)' : ''}
                            </option>
                          );
                        })}
                      </select>
                      <p style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>
                        {CATEGORY_TYPES.find(t => t.id === c.type)?.desc}
                      </p>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => removeCat(i)}
                      title={inUse ? `${catUsage[c.value]} producto(s) usan esta categoría` : 'Eliminar'}
                      disabled={inUse}
                      style={{ color: inUse ? 'var(--color-text-secondary)' : 'var(--color-danger)', flexShrink: 0 }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
              <button className="btn btn-secondary" onClick={addCat}>
                <Plus size={16} /> Agregar categoría
              </button>
              <button className="btn btn-primary" onClick={handleSaveCats} disabled={savingCats}>
                {savingCats ? <><span className="spinner spinner-sm" /> Guardando...</> : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'parametros' && isAdmin && (
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
                <label className="form-label" style={{ fontWeight: '600', marginBottom: 'var(--space-xs)', display: 'block' }}>
                  Diferencia tolerada al cerrar caja
                </label>
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  <input
                    type="number" min="0"
                    className="form-input"
                    value={cashTolerance}
                    onChange={(e) => setCashTolerance(e.target.value)}
                  />
                  <button className="btn btn-primary" onClick={handleSaveTolerance} disabled={savingParam}>
                    Guardar
                  </button>
                </div>
                <p style={{ marginTop: 'var(--space-xs)', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                  Sobrante o faltante que se considera normal al cuadrar el efectivo. Por debajo de este monto el cierre se marca en verde; por encima, en rojo (por defecto $500).
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
