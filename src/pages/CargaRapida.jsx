/**
 * CargaRapida — ingreso masivo de productos en loop:
 * escanear → autocompletar (DB local / Open Food Facts) → precio → Enter → siguiente.
 * Diseñada para que el catálogo inicial de una instalación tome minutos, no horas.
 */
import { useState, useRef, useMemo } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { useSeller } from '../context/SellerContext';
import { useConfig } from '../context/ConfigContext';
import api from '../utils/api';
import { formatCurrency } from '../utils/formatters';
import { Zap, ArrowLeft, Barcode, Search, CheckCircle2, AlertTriangle, WifiOff, PackageX } from 'lucide-react';

export default function CargaRapida() {
  const toast = useToast();
  const { currentSeller } = useSeller();
  const { categories } = useConfig();
  const canEdit = ['admin', 'dev'].includes(currentSeller?.role) || currentSeller?.products_access === 'full';
  const canViewCosts = ['admin', 'dev'].includes(currentSeller?.role) || currentSeller?.can_view_costs;

  const isStockCat = (cat) => categories.some(c => c.value === cat && c.stock);
  const categoryEmoji = useMemo(
    () => Object.fromEntries(categories.map(c => [c.value, c.emoji])),
    [categories]
  );

  // Valores "pegajosos": se mantienen entre productos para no re-tipearlos
  const [categoria, setCategoria] = useState(categories[0]?.value || '');
  const [stockDefault, setStockDefault] = useState('');

  // Item en curso
  const [barcode, setBarcode] = useState('');
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [costo, setCosto] = useState('');
  const [stock, setStock] = useState('');
  const [photo, setPhoto] = useState(null);
  const [lookup, setLookup] = useState(null);   // null | 'buscando' | 'encontrado' | 'no_encontrado' | 'offline' | 'duplicado'
  const [duplicado, setDuplicado] = useState(null);

  const [ingresados, setIngresados] = useState([]);
  const [guardando, setGuardando] = useState(false);

  const barcodeRef = useRef(null);
  const nombreRef = useRef(null);
  const precioRef = useRef(null);

  if (!canEdit) return <Navigate to="/productos" replace />;

  const resetItem = () => {
    setBarcode('');
    setNombre('');
    setPrecio('');
    setCosto('');
    setStock(stockDefault);
    setPhoto(null);
    setLookup(null);
    setDuplicado(null);
    barcodeRef.current?.focus();
  };

  const doLookup = async () => {
    const code = barcode.trim();
    if (!code) { nombreRef.current?.focus(); return; }
    setLookup('buscando');
    setDuplicado(null);
    try {
      const res = await api.get(`/products/lookup/${encodeURIComponent(code)}`);
      if (res.found && res.source === 'local') {
        setLookup('duplicado');
        setDuplicado(res);
      } else if (res.found) {
        setNombre(res.name);
        setPhoto(res.photo || null);
        setLookup('encontrado');
        setStock(prev => prev || stockDefault);
        precioRef.current?.focus();
      } else {
        setLookup(res.error === 'offline' ? 'offline' : 'no_encontrado');
        setStock(prev => prev || stockDefault);
        nombreRef.current?.focus();
      }
    } catch (err) {
      console.error('Lookup:', err);
      setLookup('no_encontrado');
      nombreRef.current?.focus();
    }
  };

  const handleGuardar = async () => {
    if (guardando) return;
    if (!nombre.trim()) { toast.error('Falta el nombre'); nombreRef.current?.focus(); return; }
    const precioNum = parseFloat(precio);
    if (!(precioNum > 0)) { toast.error('El precio debe ser mayor a 0'); precioRef.current?.focus(); return; }

    const costoNum = parseFloat(costo);
    const stockNum = parseFloat(stock);
    const payload = {
      name: nombre.trim(),
      category: categoria,
      price: precioNum,
      barcode: barcode.trim() || null,
      photo: photo || null,
      stock: isStockCat(categoria) ? (Number.isFinite(stockNum) ? stockNum : 0) : null,
      cost_price: canViewCosts && costoNum > 0 ? costoNum : null,
    };

    setGuardando(true);
    try {
      const created = await api.post('/products', payload);
      setIngresados(prev => [created, ...prev]);
      resetItem();
    } catch (err) {
      console.error('Crear producto:', err);
      toast.error('Error: ' + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handlePrecioInline = async (item, value) => {
    const nuevo = parseFloat(value);
    if (!(nuevo > 0) || nuevo === item.price) return;
    try {
      await api.patch(`/products/${item.id}`, { price: nuevo });
      setIngresados(prev => prev.map(p => (p.id === item.id ? { ...p, price: nuevo } : p)));
    } catch (err) {
      console.error('Editar precio:', err);
      toast.error('Error: ' + err.message);
    }
  };

  const enterEn = (handler) => (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handler(); }
  };

  const stockCat = isStockCat(categoria);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Zap size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />Carga rápida
        </h1>
        <Link to="/productos" className="btn btn-secondary">
          <ArrowLeft size={16} /> Volver a Productos
        </Link>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-md)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0, flex: '1 1 220px' }}>
            <label className="form-label">Categoría (se mantiene entre productos)</label>
            <select className="form-input" value={categoria} onChange={e => setCategoria(e.target.value)}>
              {categories.map(c => (
                <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
              ))}
            </select>
          </div>
          {stockCat && (
            <div className="form-group" style={{ marginBottom: 0, width: 180 }}>
              <label className="form-label">Stock inicial por defecto</label>
              <input className="form-input" type="number" min="0" placeholder="Ej: 12"
                value={stockDefault}
                onChange={e => { setStockDefault(e.target.value); setStock(e.target.value); }} />
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-md)' }}>
        <div className="form-group">
          <label className="form-label">Código de barras (escanea y sigue solo) — Enter sin código para producto sin barcode</label>
          <div style={{ position: 'relative' }}>
            <Barcode size={20} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', pointerEvents: 'none' }} />
            <input
              ref={barcodeRef}
              className="form-input form-input-lg"
              style={{ paddingLeft: 44, fontFamily: 'monospace' }}
              placeholder="Escanea o escribe el código y presiona Enter"
              value={barcode}
              onChange={e => setBarcode(e.target.value)}
              onKeyDown={enterEn(doLookup)}
              autoFocus
            />
          </div>
        </div>

        {lookup === 'buscando' && (
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)', margin: '0 0 var(--space-sm)' }}>
            <Search size={16} /> Buscando producto...
          </p>
        )}
        {lookup === 'encontrado' && (
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-success)', fontWeight: 600, margin: '0 0 var(--space-sm)' }}>
            <CheckCircle2 size={16} /> Encontrado en Open Food Facts — revisa el nombre y pon el precio
          </p>
        )}
        {lookup === 'no_encontrado' && (
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)', margin: '0 0 var(--space-sm)' }}>
            <PackageX size={16} /> Sin coincidencia — escribe el nombre a mano
          </p>
        )}
        {lookup === 'offline' && (
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-danger)', margin: '0 0 var(--space-sm)' }}>
            <WifiOff size={16} /> Sin internet para autocompletar — escribe el nombre a mano
          </p>
        )}

        {lookup === 'duplicado' && duplicado ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexWrap: 'wrap',
            background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)',
            border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)',
            padding: 'var(--space-sm) var(--space-md)',
          }}>
            <AlertTriangle size={18} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
            <span style={{ flex: 1 }}>
              Este código ya existe: <strong>{duplicado.name}</strong> ({formatCurrency(duplicado.price)}
              {duplicado.stock != null && <> · stock {duplicado.stock}</>}
              {!duplicado.active && <> · inactivo</>})
            </span>
            <button className="btn btn-secondary btn-sm" onClick={resetItem}>Siguiente producto</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {photo && (
              <img src={photo} alt="" style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: '#fff' }} />
            )}
            <div className="form-group" style={{ marginBottom: 0, flex: '2 1 260px' }}>
              <label className="form-label">Nombre *</label>
              <input ref={nombreRef} className="form-input" value={nombre}
                onChange={e => setNombre(e.target.value)}
                onKeyDown={enterEn(() => precioRef.current?.focus())}
                placeholder="Nombre del producto" />
            </div>
            <div className="form-group" style={{ marginBottom: 0, width: 140 }}>
              <label className="form-label">Precio *</label>
              <input ref={precioRef} className="form-input form-input-price" type="number" min="1" value={precio}
                onChange={e => setPrecio(e.target.value)}
                onKeyDown={enterEn(handleGuardar)}
                placeholder="$" />
            </div>
            {canViewCosts && stockCat && (
              <div className="form-group" style={{ marginBottom: 0, width: 140 }}>
                <label className="form-label">Costo (opcional)</label>
                <input className="form-input" type="number" min="0" value={costo}
                  onChange={e => setCosto(e.target.value)}
                  onKeyDown={enterEn(handleGuardar)}
                  placeholder="$" />
              </div>
            )}
            {stockCat && (
              <div className="form-group" style={{ marginBottom: 0, width: 120 }}>
                <label className="form-label">Stock</label>
                <input className="form-input" type="number" min="0" value={stock}
                  onChange={e => setStock(e.target.value)}
                  onKeyDown={enterEn(handleGuardar)}
                  placeholder="0" />
              </div>
            )}
            <button className="btn btn-primary" onClick={handleGuardar} disabled={guardando}
              style={{ height: 42 }}>
              {guardando ? 'Guardando...' : 'Guardar (Enter)'}
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="section-title" style={{ marginBottom: 'var(--space-sm)' }}>
          Ingresados en esta sesión ({ingresados.length})
        </h3>
        {ingresados.length === 0 ? (
          <p style={{ color: 'var(--color-text-light)', margin: 0 }}>
            Aún no hay productos. Escanea el primero para partir.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>
                  <th style={{ padding: '6px 8px' }}></th>
                  <th style={{ padding: '6px 8px' }}>Producto</th>
                  <th style={{ padding: '6px 8px' }}>Código</th>
                  <th style={{ padding: '6px 8px', width: 130 }}>Precio (editable)</th>
                  <th style={{ padding: '6px 8px' }}>Stock</th>
                </tr>
              </thead>
              <tbody>
                {ingresados.map(p => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '6px 8px', width: 44 }}>
                      {p.photo
                        ? <img src={p.photo} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6, background: '#fff' }} />
                        : <span style={{ fontSize: '1.4rem' }}>{categoryEmoji[p.category] || '📦'}</span>}
                    </td>
                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>{p.name}</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>
                      {p.barcode || '—'}
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <input
                        key={`${p.id}-${p.price}`}
                        className="form-input"
                        style={{ width: 110, padding: '4px 8px' }}
                        type="number"
                        min="1"
                        defaultValue={p.price}
                        onBlur={e => handlePrecioInline(p, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                      />
                    </td>
                    <td style={{ padding: '6px 8px' }}>{p.stock != null ? p.stock : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
