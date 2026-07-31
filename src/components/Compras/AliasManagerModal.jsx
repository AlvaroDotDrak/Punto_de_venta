import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { formatShortDate } from '../../utils/formatters';
import { X, BookOpen, Trash2, Search, AlertTriangle, Package } from 'lucide-react';

/**
 * Equivalencias que el escaneo aprendió: qué descripción de factura corresponde a
 * qué producto/insumo. Se alimentan solas al registrar una compra; acá se revisan
 * y se borran las que quedaron mal.
 */
export default function AliasManagerModal({ suppliers, onClose }) {
  const toast = useToast();
  const [aliases, setAliases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [supplierId, setSupplierId] = useState('');
  const [query, setQuery] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (supplierId) params.set('supplier_id', supplierId);
      if (query.trim()) params.set('q', query.trim());
      const qs = params.toString();
      setAliases(await api.get(`/purchases/aliases${qs ? `?${qs}` : ''}`));
    } catch (err) {
      console.error('Equivalencias:', err);
      toast.error('Error al cargar equivalencias: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Debounce del buscador: el filtro corre en el servidor sobre el texto normalizado.
  useEffect(() => {
    const id = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(id);
  }, [supplierId, query]);

  const handleDelete = async (alias) => {
    setDeleting(alias.id);
    try {
      await api.delete(`/purchases/aliases/${alias.id}`);
      setAliases(prev => prev.filter(a => a.id !== alias.id));
      setConfirmId(null);
      toast.success('Equivalencia borrada');
    } catch (err) {
      console.error('Borrar equivalencia:', err);
      toast.error('Error al borrar: ' + err.message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 760 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3><BookOpen size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} />Equivalencias aprendidas</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginTop: 0 }}>
            Cada vez que asignas una línea de una factura escaneada a un producto, se guarda
            acá para reconocerla sola la próxima vez. Borra las que hayan quedado mal: la
            compra ya registrada no se toca, solo deja de autoasignarse.
          </p>

          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
              <input className="form-input form-input-sm" value={query} style={{ paddingLeft: 32 }}
                onChange={e => setQuery(e.target.value)} placeholder="Buscar descripción o producto..." />
            </div>
            <select className="form-select form-select-sm" style={{ width: 200 }}
              value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">Todos los proveedores</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {loading ? (
            <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: 'var(--space-lg)' }}>
              Cargando...
            </p>
          ) : aliases.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: 'var(--space-lg)' }}>
              {query || supplierId
                ? 'Ninguna equivalencia coincide con el filtro.'
                : 'Todavía no hay equivalencias. Se van creando al registrar compras escaneadas.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
              {aliases.map(a => (
                <div key={a.id} className="card" style={{ padding: 'var(--space-sm) var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', wordBreak: 'break-word' }}>
                      {a.raw_description}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                      <span style={{ fontWeight: 600 }}>→ {a.item_name || '(ítem borrado)'}</span>
                      {!a.item_active && (
                        <span className="badge badge-danger" title="El ítem ya no está activo: esta equivalencia no se aplica">
                          <AlertTriangle size={11} style={{ verticalAlign: 'middle' }} /> inactivo
                        </span>
                      )}
                      {a.units_per_pack !== 1 && (
                        <span className="badge badge-info" title="Unidades de inventario por unidad facturada">
                          <Package size={11} style={{ verticalAlign: 'middle' }} /> x{a.units_per_pack}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                      {a.supplier_name || 'Sin proveedor'} · {a.times_seen} {a.times_seen === 1 ? 'uso' : 'usos'} · {formatShortDate(a.updated_at)}
                    </div>
                  </div>

                  {confirmId === a.id ? (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button type="button" className="btn btn-danger btn-sm" disabled={deleting === a.id}
                        onClick={() => handleDelete(a)}>
                        {deleting === a.id ? '...' : 'Borrar'}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmId(a.id)}
                      style={{ color: 'var(--color-danger)', flexShrink: 0 }} title="Borrar equivalencia">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
