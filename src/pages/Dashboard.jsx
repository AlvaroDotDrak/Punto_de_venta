/**
 * Dashboard — Métricas y reportes con gráficos interactivos
 * Top 10 productos, ventas por categoría, tendencias, ticket promedio, merma,
 * comparación con período anterior, métodos de pago, rendimiento por vendedor
 */
import { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { formatCurrency } from '../utils/formatters';
import {
  BarChart3, TrendingUp, ShoppingCart, DollarSign, Package, Trash2,
  ArrowUpRight, ArrowDownRight, Users, CreditCard,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { format, subDays, startOfDay, endOfDay, getDay, getHours } from 'date-fns';
import { es } from 'date-fns/locale';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler);

const chartColors = [
  '#C97B4B', '#E8A87C', '#C9A96E', '#5B9BD5', '#4CAF50',
  '#F5A623', '#E74C3C', '#9B59B6', '#1ABC9C', '#34495E',
];

const PAYMENT_LABELS = {
  efectivo: '💵 Efectivo',
  tarjeta: '💳 Tarjeta',
  transferencia: '🏦 Transferencia',
};

const defaultOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#2D2016',
      titleFont: { family: 'Inter' },
      bodyFont: { family: 'Inter' },
      cornerRadius: 8,
      padding: 12,
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { font: { family: 'Inter', size: 11 } },
    },
    y: {
      grid: { color: 'rgba(0,0,0,0.05)' },
      ticks: { font: { family: 'Inter', size: 11 } },
    },
  },
};

/** Muestra la variación porcentual vs período anterior */
function KpiDelta({ current, prev }) {
  if (prev === 0 && current === 0) return null;
  if (prev === 0) {
    return (
      <span style={{ fontSize: '0.72rem', color: '#4CAF50', fontWeight: 600, marginTop: 4, display: 'block' }}>
        <ArrowUpRight size={11} style={{ verticalAlign: 'middle' }} /> Nuevo período
      </span>
    );
  }
  const delta = ((current - prev) / prev) * 100;
  const up = delta >= 0;
  return (
    <span style={{
      fontSize: '0.72rem',
      color: up ? '#4CAF50' : '#E74C3C',
      fontWeight: 600,
      marginTop: 4,
      display: 'block',
    }}>
      {up
        ? <ArrowUpRight size={11} style={{ verticalAlign: 'middle' }} />
        : <ArrowDownRight size={11} style={{ verticalAlign: 'middle' }} />}
      {' '}{Math.abs(delta).toFixed(1)}% vs período anterior
    </span>
  );
}

/** Calcula las fechas del período anterior equivalente */
function getPrevPeriod(startDate, endDate) {
  const start = startOfDay(new Date(startDate));
  const end = endOfDay(new Date(endDate));
  const durationMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);
  return { prevStart, prevEnd };
}

export default function Dashboard() {
  const [dateRange, setDateRange] = useState('7d');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    const now = new Date();
    switch (dateRange) {
      case '1d': setStartDate(format(now, 'yyyy-MM-dd')); break;
      case '7d': setStartDate(format(subDays(now, 7), 'yyyy-MM-dd')); break;
      case '30d': setStartDate(format(subDays(now, 30), 'yyyy-MM-dd')); break;
      case '90d': setStartDate(format(subDays(now, 90), 'yyyy-MM-dd')); break;
    }
    setEndDate(format(now, 'yyyy-MM-dd'));
  }, [dateRange]);

  // === Período actual ===
  const filteredSales = useLiveQuery(async () => {
    const start = startOfDay(new Date(startDate));
    const end = endOfDay(new Date(endDate));
    return db.sales
      .where('createdAt')
      .between(start.toISOString(), end.toISOString(), true, true)
      .filter(s => s.status !== 'voided')
      .toArray();
  }, [startDate, endDate], []);

  const filteredItems = useLiveQuery(async () => {
    const start = startOfDay(new Date(startDate));
    const end = endOfDay(new Date(endDate));
    const saleIds = await db.sales
      .where('createdAt')
      .between(start.toISOString(), end.toISOString(), true, true)
      .filter(s => s.status !== 'voided')
      .primaryKeys();
    if (!saleIds.length) return [];
    return db.saleItems.where('saleId').anyOf(saleIds).toArray();
  }, [startDate, endDate], []);

  // === Período anterior (para comparación) ===
  const prevSales = useLiveQuery(async () => {
    const { prevStart, prevEnd } = getPrevPeriod(startDate, endDate);
    return db.sales
      .where('createdAt')
      .between(prevStart.toISOString(), prevEnd.toISOString(), true, true)
      .filter(s => s.status !== 'voided')
      .toArray();
  }, [startDate, endDate], []);

  const prevItems = useLiveQuery(async () => {
    const { prevStart, prevEnd } = getPrevPeriod(startDate, endDate);
    const saleIds = await db.sales
      .where('createdAt')
      .between(prevStart.toISOString(), prevEnd.toISOString(), true, true)
      .filter(s => s.status !== 'voided')
      .primaryKeys();
    if (!saleIds.length) return [];
    return db.saleItems.where('saleId').anyOf(saleIds).toArray();
  }, [startDate, endDate], []);

  // === Items en vitrina del período actual (para tasa de merma) ===
  const periodShowcaseItems = useLiveQuery(async () => {
    const start = startOfDay(new Date(startDate));
    const end = endOfDay(new Date(endDate));
    return db.showcaseItems
      .where('placedAt')
      .between(start.toISOString(), end.toISOString(), true, true)
      .toArray();
  }, [startDate, endDate], []);

  // === Ventas recientes (6 meses) para comparativo mensual ===
  const recentSales = useLiveQuery(async () => {
    const sixMonthsAgo = subDays(new Date(), 180);
    return db.sales
      .where('createdAt')
      .aboveOrEqual(sixMonthsAgo.toISOString())
      .filter(s => s.status !== 'voided')
      .toArray();
  }, [], []);

  // === Merma global (items removidos) ===
  const removedShowcaseItems = useLiveQuery(
    () => db.showcaseItems.where('status').equals('removed').toArray(),
    [], []
  );

  // === Sellers ===
  const sellers = useLiveQuery(() => db.sellers.toArray(), [], []);
  const sellerMap = useMemo(() => Object.fromEntries(sellers.map(s => [s.id, s])), [sellers]);

  // === Products map ===
  const products = useLiveQuery(() => db.products.toArray(), [], []);
  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);

  // === KPIs — período actual ===
  const totalRevenue = filteredSales.reduce((s, sale) => s + sale.total, 0);
  const totalSalesCount = filteredSales.length;
  const averageTicket = totalSalesCount > 0 ? Math.round(totalRevenue / totalSalesCount) : 0;
  const totalProducts = filteredItems.reduce((s, i) => s + i.quantity, 0);

  // === KPIs — período anterior ===
  const prevRevenue = prevSales.reduce((s, sale) => s + sale.total, 0);
  const prevSalesCount = prevSales.length;
  const prevAvgTicket = prevSalesCount > 0 ? Math.round(prevRevenue / prevSalesCount) : 0;
  const prevTotalProducts = prevItems.reduce((s, i) => s + i.quantity, 0);

  // === Tasa de merma (período actual) ===
  const wasteRate = useMemo(() => {
    if (!periodShowcaseItems.length) return null;
    const removed = periodShowcaseItems.filter(i => i.status === 'removed').length;
    return { removed, total: periodShowcaseItems.length, pct: (removed / periodShowcaseItems.length) * 100 };
  }, [periodShowcaseItems]);

  // === Top 10 Products ===
  const top10Data = useMemo(() => {
    const map = {};
    filteredItems.forEach(item => {
      if (!map[item.productName]) map[item.productName] = { qty: 0, revenue: 0 };
      map[item.productName].qty += item.quantity;
      map[item.productName].revenue += item.subtotal;
    });
    return Object.entries(map)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 10);
  }, [filteredItems]);

  // === Sales by Category ===
  const categoryData = useMemo(() => {
    const map = {};
    filteredItems.forEach(item => {
      const cat = item.category || productMap[item.productId]?.category || 'otro';
      if (!map[cat]) map[cat] = 0;
      map[cat] += item.subtotal;
    });
    return map;
  }, [filteredItems, productMap]);

  // === Payment Method Breakdown ===
  const paymentData = useMemo(() => {
    const map = {};
    filteredSales.forEach(sale => {
      const method = sale.paymentMethod || 'otro';
      if (!map[method]) map[method] = 0;
      map[method] += sale.total;
    });
    return map;
  }, [filteredSales]);

  // === Seller Performance ===
  const sellerPerformance = useMemo(() => {
    const map = {};
    filteredSales.forEach(sale => {
      const id = sale.sellerId;
      if (!map[id]) map[id] = { revenue: 0, count: 0 };
      map[id].revenue += sale.total;
      map[id].count++;
    });
    return Object.entries(map)
      .map(([id, data]) => ({
        name: sellerMap[parseInt(id)]?.name || `Vendedor ${id}`,
        ...data,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredSales, sellerMap]);

  // === Sales by Day of Week ===
  const byDayOfWeek = useMemo(() => {
    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const counts = new Array(7).fill(0);
    filteredSales.forEach(sale => {
      const d = new Date(sale.createdAt);
      const day = getDay(d);
      const idx = day === 0 ? 6 : day - 1;
      counts[idx] += sale.total;
    });
    return { labels: days, data: counts };
  }, [filteredSales]);

  // === Sales by Hour ===
  const byHour = useMemo(() => {
    const hours = Array.from({ length: 14 }, (_, i) => i + 7);
    const counts = new Array(14).fill(0);
    filteredSales.forEach(sale => {
      const h = getHours(new Date(sale.createdAt));
      const idx = h - 7;
      if (idx >= 0 && idx < 14) counts[idx] += sale.total;
    });
    return { labels: hours.map(h => `${h}:00`), data: counts };
  }, [filteredSales]);

  // === Monthly Sales ===
  const monthlySales = useMemo(() => {
    const map = {};
    recentSales.forEach(sale => {
      const key = format(new Date(sale.createdAt), 'yyyy-MM');
      if (!map[key]) map[key] = 0;
      map[key] += sale.total;
    });
    const sorted = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
    return {
      labels: sorted.map(([k]) => format(new Date(k + '-01'), 'MMM yyyy', { locale: es })),
      data: sorted.map(([, v]) => v),
    };
  }, [recentSales]);

  // === Waste (Merma) — top 10 productos ===
  const wasteData = useMemo(() => {
    const map = {};
    removedShowcaseItems.forEach(item => {
      if (!map[item.productId]) map[item.productId] = 0;
      map[item.productId]++;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [removedShowcaseItems]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <BarChart3 size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Dashboard
        </h1>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="quick-filters">
            {[['1d', 'Hoy'], ['7d', '7 días'], ['30d', '30 días'], ['90d', '90 días']].map(([key, label]) => (
              <button key={key} className={`quick-filter ${dateRange === key ? 'active' : ''}`} onClick={() => setDateRange(key)}>
                {label}
              </button>
            ))}
          </div>
          <div className="date-range no-print">
            <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setDateRange('custom'); }} />
            <span>—</span>
            <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setDateRange('custom'); }} />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon primary"><DollarSign size={22} /></div>
          <div className="kpi-content">
            <div className="kpi-value">{formatCurrency(totalRevenue)}</div>
            <div className="kpi-label">Ingresos totales</div>
            <KpiDelta current={totalRevenue} prev={prevRevenue} />
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon success"><ShoppingCart size={22} /></div>
          <div className="kpi-content">
            <div className="kpi-value">{totalSalesCount}</div>
            <div className="kpi-label">Ventas realizadas</div>
            <KpiDelta current={totalSalesCount} prev={prevSalesCount} />
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon warning"><TrendingUp size={22} /></div>
          <div className="kpi-content">
            <div className="kpi-value">{formatCurrency(averageTicket)}</div>
            <div className="kpi-label">Ticket promedio</div>
            <KpiDelta current={averageTicket} prev={prevAvgTicket} />
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon info"><Package size={22} /></div>
          <div className="kpi-content">
            <div className="kpi-value">{totalProducts}</div>
            <div className="kpi-label">Productos vendidos</div>
            <KpiDelta current={totalProducts} prev={prevTotalProducts} />
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon danger"><Trash2 size={22} /></div>
          <div className="kpi-content">
            {wasteRate !== null ? (
              <>
                <div className="kpi-value">{wasteRate.pct.toFixed(1)}%</div>
                <div className="kpi-label">Tasa de merma</div>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: 4, display: 'block' }}>
                  {wasteRate.removed} de {wasteRate.total} unidades retiradas
                </span>
              </>
            ) : (
              <>
                <div className="kpi-value">—</div>
                <div className="kpi-label">Tasa de merma</div>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: 4, display: 'block' }}>
                  Sin datos en vitrina en este período
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="chart-grid">
        {/* Top 10 Products */}
        <div className="chart-card">
          <div className="chart-card-title">🏆 Top 10 Productos más Vendidos</div>
          <div style={{ height: 300 }}>
            {top10Data.length > 0 ? (
              <Bar
                data={{
                  labels: top10Data.map(([name]) => name.length > 20 ? name.slice(0, 18) + '…' : name),
                  datasets: [{
                    data: top10Data.map(([, d]) => d.revenue),
                    backgroundColor: chartColors,
                    borderRadius: 6,
                  }],
                }}
                options={{
                  ...defaultOptions,
                  indexAxis: 'y',
                  plugins: {
                    ...defaultOptions.plugins,
                    tooltip: {
                      ...defaultOptions.plugins.tooltip,
                      callbacks: {
                        label: (ctx) => {
                          const item = top10Data[ctx.dataIndex];
                          return `${formatCurrency(item[1].revenue)} (${item[1].qty} unid.)`;
                        },
                      },
                    },
                  },
                }}
              />
            ) : <div className="empty-state"><p>Sin datos de ventas en este período</p></div>}
          </div>
        </div>

        {/* Sales by Category */}
        <div className="chart-card">
          <div className="chart-card-title">📊 Ventas por Categoría</div>
          <div style={{ height: 300, display: 'flex', justifyContent: 'center' }}>
            {Object.keys(categoryData).length > 0 ? (
              <Doughnut
                data={{
                  labels: Object.keys(categoryData).map(k =>
                    k === 'vitrina' ? '🍰 Vitrina' : k === 'salados' ? '🥪 Salados' : k === 'encargo' ? '🎂 Encargo' : k
                  ),
                  datasets: [{
                    data: Object.values(categoryData),
                    backgroundColor: ['#C97B4B', '#E8A87C', '#C9A96E', '#5B9BD5'],
                    borderWidth: 0,
                  }],
                }}
                options={{
                  ...defaultOptions,
                  scales: undefined,
                  plugins: {
                    ...defaultOptions.plugins,
                    legend: { display: true, position: 'bottom' },
                    tooltip: {
                      ...defaultOptions.plugins.tooltip,
                      callbacks: { label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.raw)}` },
                    },
                  },
                }}
              />
            ) : <div className="empty-state"><p>Sin datos</p></div>}
          </div>
        </div>

        {/* Payment Method Breakdown */}
        <div className="chart-card">
          <div className="chart-card-title">💳 Ventas por Método de Pago</div>
          <div style={{ height: 300, display: 'flex', justifyContent: 'center' }}>
            {Object.keys(paymentData).length > 0 ? (
              <Doughnut
                data={{
                  labels: Object.keys(paymentData).map(k => PAYMENT_LABELS[k] || k),
                  datasets: [{
                    data: Object.values(paymentData),
                    backgroundColor: ['#4CAF50', '#5B9BD5', '#C9A96E', '#E74C3C'],
                    borderWidth: 0,
                  }],
                }}
                options={{
                  ...defaultOptions,
                  scales: undefined,
                  plugins: {
                    ...defaultOptions.plugins,
                    legend: { display: true, position: 'bottom' },
                    tooltip: {
                      ...defaultOptions.plugins.tooltip,
                      callbacks: {
                        label: (ctx) => {
                          const total = Object.values(paymentData).reduce((a, b) => a + b, 0);
                          const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                          return ` ${ctx.label}: ${formatCurrency(ctx.raw)} (${pct}%)`;
                        },
                      },
                    },
                  },
                }}
              />
            ) : <div className="empty-state"><CreditCard size={32} /><p>Sin ventas en este período</p></div>}
          </div>
        </div>

        {/* Seller Performance */}
        <div className="chart-card">
          <div className="chart-card-title">👤 Rendimiento por Vendedor</div>
          <div style={{ height: 300 }}>
            {sellerPerformance.length > 0 ? (
              <Bar
                data={{
                  labels: sellerPerformance.map(s => s.name),
                  datasets: [{
                    data: sellerPerformance.map(s => s.revenue),
                    backgroundColor: chartColors,
                    borderRadius: 6,
                  }],
                }}
                options={{
                  ...defaultOptions,
                  indexAxis: 'y',
                  plugins: {
                    ...defaultOptions.plugins,
                    tooltip: {
                      ...defaultOptions.plugins.tooltip,
                      callbacks: {
                        label: (ctx) => {
                          const s = sellerPerformance[ctx.dataIndex];
                          return `${formatCurrency(s.revenue)} — ${s.count} venta${s.count !== 1 ? 's' : ''}`;
                        },
                      },
                    },
                  },
                }}
              />
            ) : <div className="empty-state"><Users size={32} /><p>Sin datos de vendedores</p></div>}
          </div>
        </div>

        {/* Sales by Day of Week */}
        <div className="chart-card">
          <div className="chart-card-title">📅 Ventas por Día de la Semana</div>
          <div style={{ height: 300 }}>
            <Bar
              data={{
                labels: byDayOfWeek.labels,
                datasets: [{
                  data: byDayOfWeek.data,
                  backgroundColor: '#C97B4B',
                  borderRadius: 6,
                }],
              }}
              options={{
                ...defaultOptions,
                plugins: {
                  ...defaultOptions.plugins,
                  tooltip: {
                    ...defaultOptions.plugins.tooltip,
                    callbacks: { label: (ctx) => formatCurrency(ctx.raw) },
                  },
                },
              }}
            />
          </div>
        </div>

        {/* Sales by Hour */}
        <div className="chart-card">
          <div className="chart-card-title">⏰ Ventas por Horario</div>
          <div style={{ height: 300 }}>
            <Line
              data={{
                labels: byHour.labels,
                datasets: [{
                  data: byHour.data,
                  borderColor: '#C97B4B',
                  backgroundColor: 'rgba(201, 123, 75, 0.1)',
                  fill: true,
                  tension: 0.4,
                  pointRadius: 4,
                  pointBackgroundColor: '#C97B4B',
                }],
              }}
              options={{
                ...defaultOptions,
                plugins: {
                  ...defaultOptions.plugins,
                  tooltip: {
                    ...defaultOptions.plugins.tooltip,
                    callbacks: { label: (ctx) => formatCurrency(ctx.raw) },
                  },
                },
              }}
            />
          </div>
        </div>

        {/* Monthly Comparison */}
        <div className="chart-card">
          <div className="chart-card-title">📈 Comparativo Mensual</div>
          <div style={{ height: 300 }}>
            {monthlySales.labels.length > 0 ? (
              <Line
                data={{
                  labels: monthlySales.labels,
                  datasets: [{
                    data: monthlySales.data,
                    borderColor: '#C9A96E',
                    backgroundColor: 'rgba(201, 169, 110, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 6,
                    pointBackgroundColor: '#C9A96E',
                    borderWidth: 3,
                  }],
                }}
                options={{
                  ...defaultOptions,
                  plugins: {
                    ...defaultOptions.plugins,
                    tooltip: {
                      ...defaultOptions.plugins.tooltip,
                      callbacks: { label: (ctx) => formatCurrency(ctx.raw) },
                    },
                  },
                }}
              />
            ) : <div className="empty-state"><p>Sin datos mensuales</p></div>}
          </div>
        </div>

        {/* Waste Analysis */}
        <div className="chart-card">
          <div className="chart-card-title">🗑️ Productos con Mayor Merma (histórico)</div>
          <div style={{ height: 300 }}>
            {wasteData.length > 0 ? (
              <Bar
                data={{
                  labels: wasteData.map(([id]) => {
                    const p = productMap[parseInt(id)];
                    return p ? (p.name.length > 20 ? p.name.slice(0, 18) + '…' : p.name) : `ID ${id}`;
                  }),
                  datasets: [{
                    data: wasteData.map(([, count]) => count),
                    backgroundColor: '#E74C3C',
                    borderRadius: 6,
                  }],
                }}
                options={{
                  ...defaultOptions,
                  indexAxis: 'y',
                  plugins: {
                    ...defaultOptions.plugins,
                    tooltip: {
                      ...defaultOptions.plugins.tooltip,
                      callbacks: { label: (ctx) => `${ctx.raw} unidades retiradas` },
                    },
                  },
                }}
              />
            ) : (
              <div className="empty-state">
                <Trash2 size={32} />
                <p>Sin registros de merma</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
