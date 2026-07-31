import { useState, useRef, useEffect } from 'react';
import api from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { formatCurrency } from '../../utils/formatters';
import { X, ScanLine, Upload, FileText, AlertTriangle, Truck, Check, Loader2 } from 'lucide-react';

const MAX_MB = { 'application/pdf': 50 };
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp';

const formatMB = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Escaneo de facturas de proveedor con IA. Sube el archivo, muestra los documentos
 * detectados (un PDF puede traer varias facturas) y deja elegir cuál cargar al
 * formulario. No guarda nada: la compra se registra cuando el admin confirma.
 */
export default function ScanInvoiceModal({ onApply, onClose }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [stage, setStage] = useState(null);      // 'reading' | 'uploading' | 'processing'
  const [uploadPct, setUploadPct] = useState(0); // null → el navegador no informa el total
  const [elapsed, setElapsed] = useState(0);
  const [docs, setDocs] = useState(null);

  // Cronómetro del procesamiento: es el único dato honesto de avance que tenemos
  // mientras el backend trabaja (la llamada no reporta progreso por página).
  useEffect(() => {
    if (stage !== 'processing') return;
    const desde = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - desde) / 1000)), 1000);
    return () => clearInterval(id);
  }, [stage]);

  const handleFile = async (file) => {
    if (!file) return;
    const maxMb = MAX_MB[file.type] || 10;
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`El archivo supera los ${maxMb}MB permitidos`);
      return;
    }
    setFileName(file.name);
    setFileSize(file.size);
    setScanning(true);
    setStage('reading');
    setUploadPct(0);
    setDocs(null);
    try {
      const dataUri = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
        reader.readAsDataURL(file);
      });
      setStage('uploading');
      const res = await api.postWithProgress(
        '/purchases/scan',
        { file_base64: dataUri, filename: file.name },
        {
          onProgress: (p) => {
            setUploadPct(p === null ? null : Math.round(p * 100));
            // Subida completa: de acá en adelante el tiempo se lo lleva la IA.
            if (p === null || p >= 1) setStage('processing');
          },
        },
      );
      setDocs(res.documentos);
      if (res.documentos.length === 0) toast.error('No se detectó ningún documento');
    } catch (err) {
      console.error('Escaneo de factura:', err);
      toast.error('Error al escanear: ' + err.message);
      setFileName('');
    } finally {
      setScanning(false);
      setStage(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3><ScanLine size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} />Escanear factura</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          {!docs && (
            <>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginTop: 0 }}>
                Sube una foto o el PDF escaneado de la factura. La IA lee los datos y precarga
                el formulario; tú revisas antes de guardar. Un PDF puede traer varias facturas.
              </p>
              {scanning ? (
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm, 6px)', padding: 'var(--space-md)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-md)', fontWeight: 600 }}>
                    <FileText size={16} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', fontWeight: 400, flexShrink: 0 }}>
                      {formatMB(fileSize)}
                    </span>
                  </div>

                  <div className={stage === 'reading' ? 'scan-stage' : 'scan-stage scan-stage-done'}>
                    {stage === 'reading'
                      ? <Loader2 size={14} className="scan-spin" />
                      : <Check size={14} style={{ color: 'var(--color-success, green)' }} />}
                    <span>Preparando el archivo</span>
                  </div>

                  {stage !== 'reading' && (
                    <>
                      <div className={stage === 'uploading' ? 'scan-stage' : 'scan-stage scan-stage-done'}>
                        {stage === 'uploading'
                          ? <Loader2 size={14} className="scan-spin" />
                          : <Check size={14} style={{ color: 'var(--color-success, green)' }} />}
                        <span style={{ flex: 1 }}>
                          {stage === 'uploading' ? 'Subiendo al servidor' : 'Archivo subido'}
                        </span>
                        {stage === 'uploading' && uploadPct !== null && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>{uploadPct}%</span>
                        )}
                      </div>
                      {stage === 'uploading' && (
                        <div className="scan-progress-bar" style={{ marginBottom: 'var(--space-md)' }}>
                          <div className={uploadPct === null ? 'scan-progress-fill indeterminate' : 'scan-progress-fill'}
                            style={uploadPct === null ? undefined : { width: `${uploadPct}%` }} />
                        </div>
                      )}
                    </>
                  )}

                  {stage === 'processing' && (
                    <>
                      <div className="scan-stage">
                        <Loader2 size={14} className="scan-spin" />
                        <span>Transcribiendo y leyendo la factura</span>
                      </div>
                      <div className="scan-progress-bar">
                        <div className="scan-progress-fill indeterminate" />
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 6 }}>
                        {elapsed}s transcurridos · suele tardar ~15s por página
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <button type="button" className="btn btn-secondary"
                  onClick={() => inputRef.current?.click()}
                  style={{ width: '100%', padding: 'var(--space-lg)', flexDirection: 'column', gap: 8 }}>
                  <Upload size={28} />
                  <span>Elegir archivo (PDF, JPG o PNG)</span>
                </button>
              )}
              <input ref={inputRef} type="file" accept={ACCEPT} style={{ display: 'none' }}
                onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
            </>
          )}

          {docs && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                  {docs.length} {docs.length === 1 ? 'documento detectado' : 'documentos detectados'} en {fileName}
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDocs(null); setFileName(''); }}>
                  Subir otro
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                {docs.map((d, i) => {
                  const sinMatch = d.lineas.filter(l => l.match.status === 'sin_match').length;
                  return (
                    <div key={i} className="card" style={{ padding: 'var(--space-md)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-md)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                              {d.tipo_documento || 'documento'}
                            </span>
                            <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Truck size={13} />
                              {d.supplier_name || d.proveedor || 'Proveedor no identificado'}
                            </strong>
                            {d.supplier_id && (
                              <span className="badge badge-success" style={{ fontSize: '0.68rem' }}>
                                <Check size={10} /> en tu lista
                              </span>
                            )}
                          </div>
                          <div style={{ marginTop: 4, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                            {d.folio ? `N° ${d.folio}` : 'sin folio'} · {d.fecha || 'sin fecha'} ·{' '}
                            {d.lineas.length} {d.lineas.length === 1 ? 'línea' : 'líneas'}
                            {d.cargos_extra.length > 0 && ` · ${d.cargos_extra.length} cargos extra`}
                            {sinMatch > 0 && ` · ${sinMatch} sin reconocer`}
                          </div>
                          {d.rut_proveedor && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                              RUT {d.rut_proveedor}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>
                            {d.total != null ? formatCurrency(d.total) : '—'}
                          </div>
                          <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 6 }}
                            onClick={() => onApply(d)}>
                            Usar esta
                          </button>
                        </div>
                      </div>

                      {(d.avisos.length > 0 || d.observaciones) && (
                        <div style={{ marginTop: 'var(--space-sm)', paddingTop: 'var(--space-sm)', borderTop: '1px solid var(--color-border)', fontSize: '0.8rem' }}>
                          {d.avisos.map((a, j) => (
                            <div key={j} style={{ display: 'flex', gap: 6, color: 'var(--color-warning, #B45309)' }}>
                              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                              <span>{a}</span>
                            </div>
                          ))}
                          {d.observaciones && (
                            <div style={{ display: 'flex', gap: 6, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                              <FileText size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                              <span>{d.observaciones}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
