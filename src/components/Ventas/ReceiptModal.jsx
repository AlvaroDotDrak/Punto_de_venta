import { useState } from 'react';
import { Printer, CheckCircle2, Loader2 } from 'lucide-react';
import { formatCurrency, formatShortDate } from '../../utils/formatters';
import { useConfig } from '../../context/ConfigContext';
import { useToast } from '../../context/ToastContext';
import api from '../../utils/api';

// Vista previa fiel al ticket que sale por la térmica (80mm) — ver backend/routers/printing.py
export default function ReceiptModal({ sale, onClose }) {
  const { branding, printing } = useConfig();
  const toast = useToast();
  const [sending, setSending] = useState(false);

  const name = branding?.name || 'Punto de Venta';
  const tagline = branding?.tagline || '';
  const address = branding?.address || '';
  const phone = branding?.phone || '';
  const rut = branding?.rut || '';
  const footer = branding?.receipt_footer || '¡Gracias por su compra!';
  const showLogo = printing?.print_logo && branding?.logo;

  const isCash = (sale.paymentMethod || 'efectivo') === 'efectivo';
  const nItems = sale.items.reduce((acc, it) => acc + it.quantity, 0);
  const fecha = sale.date
    ? `${formatShortDate(sale.date)} ${new Date(sale.date).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`
    : '';

  const handlePrint = async () => {
    setSending(true);
    try {
      await api.post('/print/receipt', {
        sale_id: sale.id,
        cash_received: isCash ? (sale.cashReceived || 0) : null,
      });
      toast.success('Boleta enviada a la impresora');
    } catch (err) {
      console.error('Imprimir boleta:', err);
      toast.error('No se pudo imprimir: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  const Row = ({ left, right, bold, big }) => (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: 8,
      fontWeight: bold ? 800 : 400,
      fontSize: big ? '1.05rem' : '0.78rem',
    }}>
      <span>{left}</span>
      <span style={{ whiteSpace: 'nowrap' }}>{right}</span>
    </div>
  );

  const dashed = { borderTop: '1px dashed #000', margin: '6px 0', opacity: 0.5 };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ background: 'rgba(18, 10, 4, 0.7)' }}>
      <div className="modal glass noise-overlay" onClick={e => e.stopPropagation()} style={{
        maxWidth: 440,
        border: 'none',
        boxShadow: 'var(--shadow-xl)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
      }}>
        <div className="modal-body" style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>
          <div className="animate-scale-in" style={{
            width: 70,
            height: 70,
            background: 'var(--color-success-bg)',
            color: 'var(--color-success)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto var(--space-lg)',
          }}>
            <CheckCircle2 size={40} strokeWidth={1.5} />
          </div>

          <h2 className="text-display" style={{ fontSize: '1.6rem', fontWeight: 900, marginBottom: 8 }}>Venta Completada</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xl)', fontSize: '0.9rem' }}>
            La transacción ha sido registrada con éxito.
          </p>

          {/* ── TICKET (réplica de la térmica) ── */}
          <div style={{
            textAlign: 'left',
            background: '#fff',
            padding: '20px 18px',
            borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--color-border)',
            marginBottom: 'var(--space-xl)',
            color: '#000',
            fontFamily: "'Courier New', monospace",
            maxWidth: 320,
            margin: '0 auto var(--space-xl)',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 10 }}>
              {showLogo && (
                <img src={branding.logo} alt="" style={{ maxWidth: 160, maxHeight: 90, objectFit: 'contain', filter: 'grayscale(1)', marginBottom: 6 }} />
              )}
              <div style={{ fontSize: '1.25rem', fontWeight: 900, lineHeight: 1.1 }}>{name}</div>
              {tagline && <div style={{ fontSize: '0.72rem' }}>{tagline}</div>}
              {address && <div style={{ fontSize: '0.72rem' }}>{address}</div>}
              {phone && <div style={{ fontSize: '0.72rem' }}>Tel: {phone}</div>}
              {rut && <div style={{ fontSize: '0.72rem' }}>RUT: {rut}</div>}
            </div>

            <div style={{ borderTop: '1px solid #000', margin: '8px 0' }} />
            <Row left={`Doc #${sale.id.toString().padStart(6, '0')}`} right={fecha} />
            <Row left={`Vend: ${sale.seller || 'Sistema'}`} right={`Pago: ${(sale.paymentMethod || 'efectivo').replace(/^\w/, c => c.toUpperCase())}`} />

            <div style={{ ...dashed, marginTop: 10 }} />
            <Row left="CANT  DESCRIPCION" right="TOTAL" bold />
            <div style={dashed} />

            {sale.items.map((item, idx) => (
              <div key={idx} style={{ marginBottom: 4 }}>
                <div style={{ fontSize: '0.78rem' }}>{item.quantity}  {item.product_name}</div>
                <Row left={`     ${formatCurrency(item.price)} c/u`} right={formatCurrency(item.subtotal)} />
              </div>
            ))}

            <div style={dashed} />
            <Row left="Articulos:" right={String(nItems)} />
            <div style={{ borderTop: '1px solid #000', margin: '10px 0' }} />

            <Row left="TOTAL" right={formatCurrency(sale.total)} bold big />
            {isCash && sale.cashReceived > 0 && (
              <>
                <Row left="Recibido" right={formatCurrency(sale.cashReceived)} />
                <Row left="Vuelto" right={formatCurrency(sale.change)} />
              </>
            )}

            <div style={{ borderTop: '1px solid #000', margin: '10px 0' }} />
            {sale.hasReceipt && (
              <div style={{ textAlign: 'center', fontWeight: 800, fontSize: '0.85rem', marginBottom: 4 }}>*** BOLETA ***</div>
            )}
            <div style={{ textAlign: 'center', fontSize: '0.75rem' }}>{footer}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={sending} style={{ height: 50, borderRadius: 'var(--radius-lg)' }}>
              Cerrar
            </button>
            <button className="btn btn-primary" onClick={handlePrint} disabled={sending} style={{ height: 50, borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}>
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
              {sending ? 'Imprimiendo...' : 'Imprimir Boleta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
