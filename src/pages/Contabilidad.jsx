import { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import { formatCurrency } from '../utils/formatters';
import { TrendingUp, TrendingDown, DollarSign, FileDown, Receipt, Scale, AlertCircle, Trash2 } from 'lucide-react';
import {
  Chart as ChartJS,
  ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement, Title,
} from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

const PIE_COLORS = [
  '#BF5A2F', '#E07B4A', '#F5A876', '#F5C9A0',
  '#8B4513', '#D2691E', '#CD853F', '#DEB887',
  '#A0522D', '#C49A6C',
];

const INCOME_PIE_COLORS = [
  '#22c55e', '#16a34a', '#4ade80', '#86efac',
  '#15803d', '#bbf7d0', '#166534', '#dcfce7',
];

const today = () => new Date().toISOString().slice(0, 10);

const getPresets = () => {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return [
    { label: 'Hoy', from: todayStr, to: todayStr },
    { label: 'Esta semana', from: weekStart.toISOString().slice(0, 10), to: todayStr },
    { label: 'Este mes', from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), to: todayStr },
    { label: 'Mes pasado', from: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10), to: new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10) },
  ];
};

export default function Contabilidad() {
  const toast = useToast();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => getPresets()[2].from);
  const [dateTo, setDateTo] = useState(today());
  const [activePreset, setActivePreset] = useState('Este mes');
  const [exporting, setExporting] = useState(false);

  // Estados para rentabilidad real
  const [activeView, setActiveView] = useState('balance'); // 'balance' o 'profitability'
  const [profitability, setProfitability] = useState(null);
  const [profLoading, setProfLoading] = useState(false);

  // Estados para pérdidas por mermas
  const [lossesReport, setLossesReport] = useState(null);
  const [lossesLoading, setLossesLoading] = useState(false);

  const loadSummary = async (from, to) => {
    setLoading(true);
    try {
      const data = await api.get(`/accounting/summary?date_from=${from}&date_to=${to}`);
      setSummary(data);
    } catch (err) {
      toast.error('Error al cargar resumen: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadProfitability = async (from = dateFrom, to = dateTo) => {
    setProfLoading(true);
    try {
      const res = await api.get(`/accounting/profitability?date_from=${from}&date_to=${to}`);
      setProfitability(res);
    } catch (err) {
      toast.error('Error al cargar rentabilidad: ' + err.message);
    } finally {
      setProfLoading(false);
    }
  };

  const loadLosses = async (from = dateFrom, to = dateTo) => {
    setLossesLoading(true);
    try {
      const res = await api.get(`/accounting/losses?date_from=${from}&date_to=${to}`);
      setLossesReport(res);
    } catch (err) {
      toast.error('Error al cargar reporte de mermas: ' + err.message);
    } finally {
      setLossesLoading(false);
    }
  };

  useEffect(() => {
    loadSummary(dateFrom, dateTo);
  }, []);

  useEffect(() => {
    if (activeView === 'profitability') {
      loadProfitability(dateFrom, dateTo);
      loadLosses(dateFrom, dateTo);
    }
  }, [activeView]);

  const applyPreset = (preset) => {
    setActivePreset(preset.label);
    setDateFrom(preset.from);
    setDateTo(preset.to);
    loadSummary(preset.from, preset.to);
    if (activeView === 'profitability') {
      loadProfitability(preset.from, preset.to);
      loadLosses(preset.from, preset.to);
    }
  };

  const applyCustom = () => {
    setActivePreset('Personalizado');
    loadSummary(dateFrom, dateTo);
    if (activeView === 'profitability') {
      loadProfitability(dateFrom, dateTo);
      loadLosses(dateFrom, dateTo);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const token = sessionStorage.getItem('authToken');
      const response = await fetch(
        `/api/accounting/export?date_from=${dateFrom}&date_to=${dateTo}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error('Error al exportar');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte_contable_${dateFrom}_${dateTo}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Reporte exportado');
    } catch (err) {
      toast.error('Error al exportar: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  // Gráfico torta: gastos por categoría
  const expensesPieData = summary?.expenses_by_category?.length > 0 ? {
    labels: summary.expenses_by_category.map(c => c.category_name),
    datasets: [{
      data: summary.expenses_by_category.map(c => c.total),
      backgroundColor: PIE_COLORS.slice(0, summary.expenses_by_category.length),
      borderWidth: 1,
      borderColor: '#fff',
    }],
  } : null;

  // Gráfico torta: ingresos por categoría de producto
  const incomePieData = summary?.income_by_category?.length > 0 ? {
    labels: summary.income_by_category.map(c => c.category_name),
    datasets: [{
      data: summary.income_by_category.map(c => c.total),
      backgroundColor: INCOME_PIE_COLORS.slice(0, summary.income_by_category.length),
      borderWidth: 1,
      borderColor: '#fff',
    }],
  } : null;

  // Gráfico barras: ingresos por método de pago vs gastos
  const barData = summary ? {
    labels: ['Efectivo', 'Tarjeta', 'Transferencia', 'Gastos'],
    datasets: [{
      label: 'Monto ($)',
      data: [
        summary.total_income_cash,
        summary.total_income_card,
        summary.total_income_transfer,
        summary.total_expenses,
      ],
      backgroundColor: [
        'rgba(34, 197, 94, 0.75)',
        'rgba(59, 130, 246, 0.75)',
        'rgba(168, 85, 247, 0.75)',
        'rgba(239, 68, 68, 0.75)',
      ],
      borderRadius: 6,
    }],
  } : null;

  const profitColor = summary && summary.net_profit >= 0
    ? 'var(--color-success)'
    : 'var(--color-danger)';

  const vatColor = summary && summary.vat_balance >= 0
    ? '#ef4444'   // a pagar → rojo
    : '#22c55e';  // saldo a favor → verde

  const pieOptions = {
    plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 8 } } },
    maintainAspectRatio: true,
  };

  return (
    <div>
      <div className="page-header" style={{ justifyContent: 'space-between' }}>
        <h1 className="page-title">Contabilidad</h1>
        <button
          className={`btn btn-primary ${exporting ? 'btn-loading' : ''}`}
          onClick={handleExport}
          disabled={exporting || !summary}
        >
          <FileDown size={16} />
          {exporting ? 'Exportando...' : 'Exportar para contador'}
        </button>
      </div>

      {/* Selector de período */}
      <div className="card" style={{ marginBottom: 'var(--space-lg)', display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
          {getPresets().map(p => (
            <button
              key={p.label}
              className={`btn ${activePreset === p.label ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-end', marginLeft: 'auto' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Desde</label>
            <input type="date" className="form-input" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setActivePreset('Personalizado'); }} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Hasta</label>
            <input type="date" className="form-input" value={dateTo}
              onChange={e => { setDateTo(e.target.value); setActivePreset('Personalizado'); }} />
          </div>
          <button className="btn btn-secondary btn-sm" onClick={applyCustom}>Aplicar</button>
        </div>
      </div>

      {/* Tabs de Vista */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--space-xl)' }}>
        <button
          onClick={() => setActiveView('balance')}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            borderBottom: activeView === 'balance' ? '2.5px solid var(--color-primary)' : '2.5px solid transparent',
            color: activeView === 'balance' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.95rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.2s'
          }}
        >
          <Scale size={16} /> Balance General
        </button>
        <button
          onClick={() => setActiveView('profitability')}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            borderBottom: activeView === 'profitability' ? '2.5px solid var(--color-primary)' : '2.5px solid transparent',
            color: activeView === 'profitability' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.95rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.2s'
          }}
        >
          <TrendingUp size={16} /> Rentabilidad Real (COGS)
        </button>
      </div>

      {activeView === 'profitability' ? (
        profLoading ? (
          <div className="card animate-fade-in" style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>
            Calculando costos y márgenes de rentabilidad...
          </div>
        ) : profitability && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {/* KPIs de Rentabilidad */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-md)' }}>
              <SummaryCard
                icon={<TrendingUp size={22} />}
                label="Venta Total (Productos)"
                value={formatCurrency(profitability.total_revenue)}
                sub="Ingresos brutos percibidos"
                color="var(--color-success)"
              />
              <SummaryCard
                icon={<TrendingDown size={22} />}
                label="Costo de Insumos (COGS)"
                value={formatCurrency(profitability.total_cogs)}
                sub="Consumos de ingredientes valorizados"
                color="#C0392B"
              />
              <SummaryCard
                icon={<Trash2 size={22} />}
                label="Pérdidas por Merma"
                value={lossesReport ? formatCurrency(lossesReport.total_loss_cost) : '$0'}
                sub="Insumos perdidos/desechados"
                color="#C0392B"
              />
              <SummaryCard
                icon={<DollarSign size={22} />}
                label="Utilidad Real"
                value={lossesReport ? formatCurrency(profitability.total_profit - lossesReport.total_loss_cost) : formatCurrency(profitability.total_profit)}
                sub="Utilidad bruta − Mermas"
                color="var(--color-primary)"
                highlight
              />
              <SummaryCard
                icon={<Scale size={22} />}
                label="Margen de Contribución"
                value={`${profitability.total_margin}%`}
                sub="Eficiencia de bodega"
                color="#2E7BBF"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-md)', marginTop: 'var(--space-sm)' }}>
              {/* Márgenes por Categoría */}
              <div className="card">
                <h3 style={{ margin: '0 0 var(--space-md)', fontSize: '0.95rem', fontWeight: 600 }}>
                  Márgenes por Categoría
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Categoría</th>
                      <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Ventas</th>
                      <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Costo Insumos</th>
                      <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Margen %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitability.categories.map((c, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '8px 0', fontWeight: 600 }}>{c.label}</td>
                        <td style={{ padding: '8px 0', textAlign: 'right' }}>{formatCurrency(c.revenue)}</td>
                        <td style={{ padding: '8px 0', textAlign: 'right', color: '#C0392B' }}>{formatCurrency(c.cogs)}</td>
                        <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, color: c.margin >= 50 ? 'var(--color-success)' : c.margin >= 30 ? '#C8820A' : '#C0392B' }}>
                          {c.margin}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Nota de Costeo */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Detalle de Costeo Real (COGS)</h4>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  * El Costo de Ventas (COGS) se registra dinámicamente al momento de cada venta usando el precio unitario del insumo registrado en esa fecha exacta.
                </p>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  * El fallback de costo aproximado (precio actual de bodega) solo se aplica a registros históricos previos a la implementación.
                </p>
                <div style={{ padding: '8px 12px', background: 'rgba(200, 130, 10, 0.05)', border: '1px solid rgba(200, 130, 10, 0.15)', borderRadius: 'var(--radius-md)', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <AlertCircle size={18} style={{ color: '#C8820A', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.76rem', color: 'var(--color-text-secondary)', lineHeight: 1.3 }}>
                    <strong>Sin Receta:</strong> Productos sin receta se asumen al 100% de margen. Configure sus ingredientes para obtener costeo preciso.
                  </span>
                </div>
              </div>
            </div>

            {/* Listado Detallado de Productos */}
            <div className="card" style={{ marginTop: 'var(--space-sm)' }}>
              <h3 style={{ margin: '0 0 var(--space-md)', fontSize: '0.95rem', fontWeight: 600 }}>
                Desglose de Rentabilidad por Producto
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Producto</th>
                    <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Categoría</th>
                    <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Udes</th>
                    <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Venta Bruta</th>
                    <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--color-text-secondary)', fontWeight: 500 }}>COGS</th>
                    <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Utilidad</th>
                    <th style={{ textAlign: 'left', padding: '6px 0 6px 20px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Margen de Utilidad (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {profitability.products.map((p) => {
                    const marginColor = p.margin >= 60 ? '#2E8B57' : p.margin >= 40 ? '#2E7BBF' : p.margin >= 25 ? '#C8820A' : '#C0392B';
                    return (
                      <tr key={p.product_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '10px 0' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontWeight: 600 }}>{p.name}</span>
                            {!p.has_recipe && (
                              <span style={{ fontSize: '0.68rem', color: '#C8820A', background: 'rgba(200, 130, 10, 0.08)', padding: '1px 5px', borderRadius: 4, width: 'fit-content', fontWeight: 600 }}>
                                Sin receta
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '10px 0', color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>{p.category}</td>
                        <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 500 }}>{p.units_sold}</td>
                        <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 600, color: 'var(--color-success)' }}>{formatCurrency(p.revenue)}</td>
                        <td style={{ padding: '10px 0', textAlign: 'right', color: p.cogs > 0 ? '#C0392B' : 'var(--color-text-light)' }}>
                          {p.cogs > 0 ? formatCurrency(p.cogs) : '—'}
                        </td>
                        <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 700 }}>{formatCurrency(p.profit)}</td>
                        <td style={{ padding: '10px 0 10px 20px', minWidth: 160 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: 'rgba(0,0,0,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.max(0, Math.min(100, p.margin))}%`, height: '100%', background: marginColor, borderRadius: 99 }} />
                            </div>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: marginColor, width: 36, textAlign: 'right' }}>
                              {p.margin}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Reporte de Mermas */}
            {lossesReport && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-md)', marginTop: 'var(--space-sm)' }}>
                {/* Tabla Insumos Perdidos */}
                <div className="card animate-fade-in">
                  <h3 style={{ margin: '0 0 var(--space-md)', fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Trash2 size={16} style={{ color: '#C0392B' }} /> Insumos Desechados (Mermas)
                  </h3>
                  {lossesLoading ? (
                    <div style={{ padding: 'var(--space-md)', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                      Cargando mermas...
                    </div>
                  ) : lossesReport.by_ingredient.length === 0 ? (
                    <div style={{ padding: 'var(--space-md)', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                      No se registraron mermas en este período.
                    </div>
                  ) : (
                    <div className="table-wrapper" style={{ margin: 0, boxShadow: 'none', border: '1px solid var(--color-border)' }}>
                      <table style={{ fontSize: '0.85rem' }}>
                        <thead>
                          <tr>
                            <th>Insumo</th>
                            <th style={{ textAlign: 'right' }}>Cantidad</th>
                            <th style={{ textAlign: 'right' }}>Costo de Pérdida</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lossesReport.by_ingredient.map((item, idx) => (
                            <tr key={idx}>
                              <td style={{ fontWeight: 600 }}>{item.name}</td>
                              <td style={{ textAlign: 'right' }}>{item.quantity} {item.unit}</td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: '#C0392B' }}>
                                {formatCurrency(item.total_cost)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Tabla Motivos de Merma */}
                <div className="card animate-fade-in">
                  <h3 style={{ margin: '0 0 var(--space-md)', fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle size={16} style={{ color: '#C8820A' }} /> Motivos de Pérdida
                  </h3>
                  {lossesLoading ? (
                    <div style={{ padding: 'var(--space-md)', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                      Cargando motivos...
                    </div>
                  ) : lossesReport.by_reason.length === 0 ? (
                    <div style={{ padding: 'var(--space-md)', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                      No se especificaron motivos en este período.
                    </div>
                  ) : (
                    <div className="table-wrapper" style={{ margin: 0, boxShadow: 'none', border: '1px solid var(--color-border)' }}>
                      <table style={{ fontSize: '0.85rem' }}>
                        <thead>
                          <tr>
                            <th>Motivo / Nota</th>
                            <th style={{ textAlign: 'right' }}>Ocurrencias</th>
                            <th style={{ textAlign: 'right' }}>Costo Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lossesReport.by_reason.map((item, idx) => (
                            <tr key={idx}>
                              <td style={{ fontWeight: 600 }}>{item.notes}</td>
                              <td style={{ textAlign: 'right' }}>{item.count}</td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: '#C0392B' }}>
                                {formatCurrency(item.total_cost)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        <>
      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>
          Cargando resumen...
        </div>
      )}

      {!loading && summary && (
        <>
          {/* ── Cards resumen ──────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
            <SummaryCard
              icon={<TrendingUp size={22} />}
              label="Total Ingresos"
              value={formatCurrency(summary.total_income)}
              sub={`${summary.sales_count} ventas`}
              color="var(--color-success)"
            />
            <SummaryCard
              icon={<TrendingDown size={22} />}
              label="Total Gastos"
              value={formatCurrency(summary.total_expenses)}
              sub={`${summary.expenses_by_category.reduce((s, c) => s + c.count, 0)} registros`}
              color="var(--color-danger)"
            />
            <SummaryCard
              icon={<DollarSign size={22} />}
              label="Utilidad Neta"
              value={formatCurrency(Math.abs(summary.net_profit))}
              sub={summary.net_profit >= 0 ? 'Ganancia' : 'Pérdida'}
              color={profitColor}
              highlight
            />
            <SummaryCard
              icon={<Receipt size={22} />}
              label="Boletas"
              value={`${summary.sales_with_receipt} / ${summary.sales_count}`}
              sub={`${summary.sales_without_receipt} sin boleta`}
              color="var(--color-primary)"
            />
          </div>

          {/* ── Card IVA estimado ───────────────────────────────────────────── */}
          <div className="card" style={{ marginBottom: 'var(--space-lg)', borderLeft: '4px solid #6366f1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-md)' }}>
              <Scale size={18} style={{ color: '#6366f1' }} />
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
                Estimación IVA
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginLeft: 4 }}>
                fórmula 19/119 — precios de venta incluyen IVA
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-lg)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  Débito Fiscal
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ef4444' }}>
                  {formatCurrency(Math.round(summary.vat_debit))}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  IVA cobrado en ventas con boleta + facturas emitidas
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  Crédito Fiscal
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#22c55e' }}>
                  {formatCurrency(Math.round(summary.vat_credit))}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  IVA recuperable en compras con factura de proveedor
                </div>
              </div>
              <div style={{
                background: `color-mix(in srgb, ${vatColor} 8%, var(--color-surface))`,
                border: `1px solid color-mix(in srgb, ${vatColor} 25%, var(--color-border))`,
                borderRadius: 'var(--radius-sm)', padding: 'var(--space-sm)',
              }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  IVA Estimado a Pagar
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: vatColor }}>
                  {summary.vat_balance < 0 ? '−' : ''}{formatCurrency(Math.round(Math.abs(summary.vat_balance)))}
                </div>
                <div style={{ fontSize: '0.75rem', color: vatColor, marginTop: 2, fontWeight: 600 }}>
                  {summary.vat_balance < 0 ? 'Saldo a favor (remanente crédito fiscal)' : 'A declarar en formulario F29'}
                </div>
              </div>
            </div>
          </div>

          {/* ── Gráficos (3 columnas) ──────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
            <div className="card">
              <h3 style={{ margin: '0 0 var(--space-md)', fontSize: '0.95rem', fontWeight: 600 }}>
                Gastos por categoría
              </h3>
              {expensesPieData ? (
                <div style={{ maxHeight: 260 }}>
                  <Pie data={expensesPieData} options={pieOptions} />
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: 'var(--space-xl)' }}>
                  Sin gastos en el período
                </div>
              )}
            </div>

            <div className="card">
              <h3 style={{ margin: '0 0 var(--space-md)', fontSize: '0.95rem', fontWeight: 600 }}>
                Ingresos por categoría
              </h3>
              {incomePieData ? (
                <div style={{ maxHeight: 260 }}>
                  <Pie data={incomePieData} options={pieOptions} />
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: 'var(--space-xl)' }}>
                  Sin ventas en el período
                </div>
              )}
            </div>

            <div className="card">
              <h3 style={{ margin: '0 0 var(--space-md)', fontSize: '0.95rem', fontWeight: 600 }}>
                Ingresos vs Gastos
              </h3>
              {barData && (
                <Bar
                  data={barData}
                  options={{
                    plugins: { legend: { display: false } },
                    scales: { y: { ticks: { callback: v => '$' + v.toLocaleString('es-CL') } } },
                    maintainAspectRatio: true,
                  }}
                />
              )}
            </div>
          </div>

          {/* ── Detalle ventas y boletas ───────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
            <div className="card">
              <h3 style={{ margin: '0 0 var(--space-md)', fontSize: '0.95rem', fontWeight: 600 }}>
                Ventas por método de pago
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Método</th>
                    <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Efectivo', value: summary.total_income_cash },
                    { label: 'Tarjeta', value: summary.total_income_card },
                    { label: 'Transferencia', value: summary.total_income_transfer },
                  ].map(row => (
                    <tr key={row.label} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '8px 0' }}>{row.label}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(row.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h3 style={{ margin: '0 0 var(--space-md)', fontSize: '0.95rem', fontWeight: 600 }}>
                Boletas y facturas
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                  <span>Ventas con boleta</span>
                  <span className="badge badge-success">{summary.sales_with_receipt}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                  <span>Ventas sin boleta</span>
                  <span className="badge badge-danger">{summary.sales_without_receipt}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                  <span>Facturas emitidas</span>
                  <span className="badge badge-info">{summary.invoices_count}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                  <span>Total facturado</span>
                  <span style={{ fontWeight: 700 }}>{formatCurrency(summary.invoices_total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Tabla ingresos por categoría ───────────────────────────────── */}
          {summary.income_by_category.length > 0 && (
            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
              <h3 style={{ margin: '0 0 var(--space-md)', fontSize: '0.95rem', fontWeight: 600 }}>
                Detalle ingresos por categoría
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Categoría</th>
                    <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Unidades</th>
                    <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Total</th>
                    <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--color-text-secondary)', fontWeight: 500 }}>% del ingreso</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.income_by_category.map((cat, i) => (
                    <tr key={cat.category_name} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '8px 0' }}>
                        <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: INCOME_PIE_COLORS[i % INCOME_PIE_COLORS.length], marginRight: 8 }} />
                        {cat.category_name}
                      </td>
                      <td style={{ padding: '8px 0', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{cat.count}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600, color: 'var(--color-success)' }}>{formatCurrency(cat.total)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right' }}>
                        {summary.total_income > 0
                          ? `${((cat.total / summary.total_income) * 100).toFixed(1)}%`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ padding: '8px 0', fontWeight: 700 }} colSpan={2}>Total</td>
                    <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, color: 'var(--color-success)' }}>
                      {formatCurrency(summary.total_income)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* ── Tabla gastos por categoría ─────────────────────────────────── */}
          {summary.expenses_by_category.length > 0 && (
            <div className="card">
              <h3 style={{ margin: '0 0 var(--space-md)', fontSize: '0.95rem', fontWeight: 600 }}>
                Detalle gastos por categoría
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Categoría</th>
                    <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Registros</th>
                    <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Total</th>
                    <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--color-text-secondary)', fontWeight: 500 }}>% del gasto</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.expenses_by_category.map((cat, i) => (
                    <tr key={cat.category_name} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '8px 0' }}>
                        <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: PIE_COLORS[i % PIE_COLORS.length], marginRight: 8 }} />
                        {cat.category_name}
                      </td>
                      <td style={{ padding: '8px 0', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{cat.count}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600, color: 'var(--color-danger)' }}>{formatCurrency(cat.total)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right' }}>
                        {summary.total_expenses > 0
                          ? `${((cat.total / summary.total_expenses) * 100).toFixed(1)}%`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ padding: '8px 0', fontWeight: 700 }} colSpan={2}>Total</td>
                    <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, color: 'var(--color-danger)' }}>
                      {formatCurrency(summary.total_expenses)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, sub, color, highlight }) {
  return (
    <div className="card" style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      borderLeft: `4px solid ${color}`,
      background: highlight ? `color-mix(in srgb, ${color} 8%, var(--color-surface))` : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color }}>
        {icon}
        <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>{label}</span>
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{sub}</div>}
    </div>
  );
}
