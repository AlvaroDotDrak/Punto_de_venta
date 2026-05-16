import { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import { PlusCircle, AlertTriangle } from 'lucide-react';

// Validación y formateo de RUT chileno
function calcDv(body) {
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const rem = 11 - (sum % 11);
  if (rem === 11) return '0';
  if (rem === 10) return 'K';
  return String(rem);
}

function validateRut(rut) {
  const clean = rut.replace(/[.\-\s]/g, '').toUpperCase();
  if (clean.length < 2) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body)) return false;
  return dv === calcDv(body);
}

function formatRut(raw) {
  const clean = raw.replace(/[.\-\s]/g, '').toUpperCase();
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted}-${dv}`;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function Facturas() {
  const toast = useToast();

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Filtros lista
  const [filterFrom, setFilterFrom] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  );
  const [filterTo, setFilterTo] = useState(today());

  // Formulario
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [rut, setRut] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [netAmount, setNetAmount] = useState('');
  const [saleId, setSaleId] = useState('');
  const [description, setDescription] = useState('');
  const [showForm, setShowForm] = useState(false);

  const rutIsValid = rut.length > 0 ? validateRut(rut) : null;
  const net = parseFloat(netAmount) || 0;
  const tax = Math.round(net * 0.19);
  const total = net + tax;

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const data = await api.get(`/invoices?date_from=${filterFrom}&date_to=${filterTo}`);
      setInvoices(data);
    } catch (err) {
      toast.error('Error al cargar facturas: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadInvoices(); }, [filterFrom, filterTo]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!invoiceNumber.trim() || !rut.trim() || !businessName.trim() || net <= 0) {
      toast.error('Completa todos los campos obligatorios');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/invoices', {
        invoice_number: invoiceNumber.trim(),
        rut: rut.trim(),
        business_name: businessName.trim(),
        net_amount: net,
        sale_id: saleId ? parseInt(saleId) : null,
        description: description.trim() || null,
      });
      toast.success(`Factura ${invoiceNumber} registrada`);
      setInvoiceNumber('');
      setRut('');
      setBusinessName('');
      setNetAmount('');
      setSaleId('');
      setDescription('');
      setShowForm(false);
      await loadInvoices();
    } catch (err) {
      toast.error('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const totalFacturado = invoices.reduce((s, i) => s + i.total_amount, 0);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Facturas</h1>
        <button
          className="btn btn-primary"
          onClick={() => setShowForm(f => !f)}
        >
          <PlusCircle size={16} />
          {showForm ? 'Cancelar' : 'Nueva factura'}
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="card" style={{ marginBottom: 'var(--space-lg)', maxWidth: 640 }}>
          <h3 style={{ margin: '0 0 var(--space-md)', fontSize: '1rem', fontWeight: 600 }}>
            Registrar factura
          </h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>

              <div className="form-group">
                <label className="form-label">N° Factura *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej: 000123"
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  RUT *
                  {rut.length > 0 && (
                    <span style={{ marginLeft: 8, fontSize: '0.75rem', color: rutIsValid ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      {rutIsValid ? '✓ Válido' : '✗ Inválido'}
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="12.345.678-9"
                  value={rut}
                  onChange={e => setRut(formatRut(e.target.value))}
                  maxLength={12}
                  required
                />
                {rut.length > 0 && !rutIsValid && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: '0.78rem', color: 'var(--color-danger)' }}>
                    <AlertTriangle size={13} />
                    RUT inválido — se puede guardar igual (RUT extranjero/provisional)
                  </div>
                )}
              </div>

              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Razón social *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Empresa S.A."
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Monto neto ($) *</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="0"
                  min="1"
                  step="1"
                  value={netAmount}
                  onChange={e => setNetAmount(e.target.value)}
                  required
                />
              </div>

              {/* IVA y total calculados automáticamente */}
              {net > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, padding: 'var(--space-sm)', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>IVA (19%)</span>
                    <span>{formatCurrency(tax)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                    <span>Total</span>
                    <span style={{ color: 'var(--color-primary)' }}>{formatCurrency(total)}</span>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Venta asociada <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>(opcional)</span></label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="ID de venta..."
                  min="1"
                  value={saleId}
                  onChange={e => setSaleId(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Descripción <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>(opcional)</span></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Descripción del servicio..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  maxLength={200}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
              <button
                type="submit"
                className={`btn btn-primary ${submitting ? 'btn-loading' : ''}`}
                disabled={submitting}
              >
                {submitting ? 'Guardando...' : 'Guardar factura'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 'var(--space-md)', display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
          <label className="form-label">Desde</label>
          <input type="date" className="form-input" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
          <label className="form-label">Hasta</label>
          <input type="date" className="form-input" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
        </div>
        {invoices.length > 0 && (
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{invoices.length} facturas</div>
            <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{formatCurrency(totalFacturado)}</div>
          </div>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>
          Cargando...
        </div>
      ) : invoices.length === 0 ? (
        <div className="card empty-state">
          <span style={{ fontSize: '2rem' }}>🧾</span>
          <h3>Sin facturas</h3>
          <p>No hay facturas registradas en el período seleccionado</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)', borderBottom: '2px solid var(--color-border)' }}>
                {['N° Factura', 'RUT', 'Razón Social', 'Neto', 'IVA', 'Total', 'Venta', 'Fecha'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-secondary)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{inv.invoice_number}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{inv.rut}</td>
                  <td style={{ padding: '10px 12px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {inv.business_name}
                    {inv.description && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{inv.description}</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCurrency(inv.net_amount)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{formatCurrency(inv.tax_amount)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--color-primary)' }}>{formatCurrency(inv.total_amount)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {inv.sale_id ? (
                      <span className="badge badge-info">#{inv.sale_id}</span>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                    {formatDate(inv.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
