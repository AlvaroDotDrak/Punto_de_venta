/**
 * Configuración — Backup, audit log, datos, parámetros
 * V4.0: incluye edición de configuraciones dinámicas
 */
import { useState, useEffect } from 'react';
import { useSeller } from '../context/SellerContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import { formatDate } from '../utils/formatters';
import { Settings, Download, Clock, Shield, Sliders } from 'lucide-react';

export default function Configuracion() {
  const toast = useToast();
  const { currentSeller } = useSeller();
  const [activeTab, setActiveTab] = useState('backup');
  const [auditLogs, setAuditLogs] = useState([]);
  const [backupPath, setBackupPath] = useState('');
  const [loadingBackup, setLoadingBackup] = useState(false);
  const [configParams, setConfigParams] = useState({});
  const [savingParam, setSavingParam] = useState(false);

  useEffect(() => {
    if (activeTab === 'audit') {
      api.get('/audit?limit=100').then(setAuditLogs).catch(() => {});
    } else if (activeTab === 'parametros') {
      api.get('/config').then(setConfigParams).catch(() => {});
    }
  }, [activeTab]);

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

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><Settings size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />Configuración</h1>
      </div>

      <div className="tabs" style={{ marginBottom: 'var(--space-lg)' }}>
        {[
          ['backup', 'Backup'],
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
