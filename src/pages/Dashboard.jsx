/**
 * Dashboard — Métricas y reportes con gráficos interactivos
 * V3.0: consume FastAPI backend
 */
import { useState, useMemo, useEffect } from 'react';
import api from '../utils/api';
import { formatCurrency } from '../utils/formatters';
import {
  BarChart3, TrendingUp, ShoppingCart, DollarSign, Package, Trash2,
  ArrowUpRight, ArrowDownRight, CreditCard,
} from 'lucide-react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import DateInput from '../components/DateInput';
import { format, subDays, startOfDay, endOfDay, getDay, getHours } from 'date-fns';
import { es } from 'date-fns/locale';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler);

const chartColors = ['#C97B4B','#E8A87C','#C9A96E','#5B9BD5','#4CAF50','#F5A623','#E74C3C','#9B59B6','#1ABC9C','#34495E'];
const PAYMENT_LABELS = { efectivo: '💵 Efectivo', debito: '💳 Débito', credito: '💳 Crédito', transferencia: '🏦 Transferencia' };

const defaultOptions = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { backgroundColor: '#2D2016', titleFont: { family: 'Inter' }, bodyFont: { family: 'Inter' }, cornerRadius: 8, padding: 12 },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 } } },
    y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { family: 'Inter', size: 11 } } },
  },
};

function getPrevPeriod(startDate, endDate) {
  const start = startOfDay(new Date(startDate));
  const end = endOfDay(new Date(endDate));
  const durationMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);
  return { prevStart: format(prevStart, 'yyyy-MM-dd'), prevEnd: format(prevEnd, 'yyyy-MM-dd') };
}

function KpiDelta({ current, prev }) {
  if (prev === 0 && current === 0) return null;
  if (prev === 0) return <span style={{ fontSize: '0.72rem', color: '#4CAF50', fontWeight: 600, marginTop: 4, display: 'block' }}><ArrowUpRight size={11} /> Nuevo período</span>;
  const delta = ((current - prev) / prev) * 100;
  const up = delta >= 0;
  return (
    <span style={{ fontSize: '0.72rem', color: up ? '#4CAF50' : '#E74C3C', fontWeight: 600, marginTop: 4, display: 'block' }}>
      {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />} {Math.abs(delta).toFixed(1)}% vs período anterior
    </span>
  );
}

export default function Dashboard() {
  const [dateRange, setDateRange] = useState('7d');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const [currentSales, setCurrentSales] = useState([]);
  const [prevSales, setPrevSales] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    const now = new Date();
    if (dateRange === '1d') { setStartDate(format(now, 'yyyy-MM-dd')); setEndDate(format(now, 'yyyy-MM-dd')); }
    else if (dateRange === '7d') { setStartDate(format(subDays(now, 7), 'yyyy-MM-dd')); setEndDate(format(now, 'yyyy-MM-dd')); }
    else if (dateRange === '30d') { setStartDate(format(subDays(now, 30), 'yyyy-MM-dd')); setEndDate(format(now, 'yyyy-MM-dd')); }
    else if (dateRange === '90d') { setStartDate(format(subDays(now, 90), 'yyyy-MM-dd')); setEndDate(format(now, 'yyyy-MM-dd')); }
  }, [dateRange]);

  useEffect(() => {
    const { prevStart, prevEnd } = getPrevPeriod(startDate, endDate);
    Promise.all([
      api.get(`/sales?limit=2000&date_from=${startDate}&date_to=${endDate}`),
      api.get(`/sales?limit=2000&date_from=${prevStart}&date_to=${prevEnd}`),
      api.get(`/sales?limit=2000&date_from=${format(subDays(new Date(), 180), 'yyyy-MM-dd')}`),
      api.get('/sellers'),
      api.get('/products?active_only=false'),
    ]).then(([cur, prev, recent, sel, prods]) => {
      setCurrentSales(cur.filter(s => s.status !== 'voided'));
      setPrevSales(prev.filter(s => s.status !== 'voided'));
      setRecentSales(recent.filter(s => s.status !== 'voided'));
      setSellers(sel);
      setProducts(prods);
    }).catch(() => {});
  }, [startDate, endDate]);

  const sellerMap  = useMemo(() => Object.fromEntries(sellers.map(s => [s.id, s])), [sellers]);
  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);
  const currentItems = useMemo(() => currentSales.flatMap(s => s.items || []), [currentSales]);
  const prevItems = useMemo(() => prevSales.flatMap(s => s.items || []), [prevSales]);

  // KPIs
  const totalRevenue = currentSales.reduce((s, v) => s + v.total, 0);
  const prevRevenue = prevSales.reduce((s, v) => s + v.total, 0);
  const totalSalesCount = currentSales.length;
  const prevSalesCount = prevSales.length;
  const averageTicket = totalSalesCount > 0 ? Math.round(totalRevenue / totalSalesCount) : 0;
  const prevAvgTicket = prevSalesCount > 0 ? Math.round(prevRevenue / prevSalesCount) : 0;
  const totalProducts = currentItems.reduce((s, i) => s + i.quantity, 0);
  const prevTotalProducts = prevItems.reduce((s, i) => s + i.quantity, 0);

  // Top 10
  const top10Data = useMemo(() => {
    const map = {};
    currentItems.forEach(i => {
      if (!map[i.product_name]) map[i.product_name] = { qty: 0, revenue: 0 };
      map[i.product_name].qty += i.quantity;
      map[i.product_name].revenue += i.subtotal;
    });
    return Object.entries(map).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 10);
  }, [currentItems]);

  // Categoría
  const categoryData = useMemo(() => {
    const map = {};
    currentItems.forEach(i => {
      const cat = productMap[i.product_id]?.category || 'otro';
      if (!map[cat]) map[cat] = 0;
      map[cat] += i.subtotal;
    });
    return map;
  }, [currentItems, productMap]);

  // Pago
  const paymentData = useMemo(() => {
    const map = {};
    currentSales.forEach(s => {
      const m = s.payment_method || 'otro';
      if (!map[m]) map[m] = 0;
      map[m] += s.total;
    });
    return map;
  }, [currentSales]);

  // Vendedor
  const sellerPerformance = useMemo(() => {
    const map = {};
    currentSales.forEach(s => {
      const id = s.seller_id;
      if (!map[id]) map[id] = { revenue: 0, count: 0 };
      map[id].revenue += s.total;
      map[id].count++;
    });
    return Object.entries(map)
      .map(([id, d]) => ({ name: sellerMap[parseInt(id)]?.name || `Vendedor ${id}`, ...d }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [currentSales, sellerMap]);

  // Por día de semana
  const byDayOfWeek = useMemo(() => {
    const days = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    const counts = new Array(7).fill(0);
    currentSales.forEach(s => {
      const d = getDay(new Date(s.created_at));
      counts[d === 0 ? 6 : d - 1] += s.total;
    });
    return { labels: days, data: counts };
  }, [currentSales]);

  // Mensual (6 meses)
  const monthlySales = useMemo(() => {
    const map = {};
    recentSales.forEach(s => {
      const key = format(new Date(s.created_at), 'yyyy-MM');
      if (!map[key]) map[key] = 0;
      map[key] += s.total;
    });
    const sorted = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
    return {
      labels: sorted.map(([k]) => format(new Date(k + '-01'), 'MMM yyyy', { locale: es })),
      data: sorted.map(([, v]) => v),
    };
  }, [recentSales]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><BarChart3 size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />Dashboard</h1>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="quick-filters">
            {[['1d','Hoy'],['7d','7 días'],['30d','30 días'],['90d','90 días']].map(([key, label]) => (
              <button key={key} className={`quick-filter ${dateRange === key ? 'active' : ''}`} onClick={() => setDateRange(key)}>{label}</button>
            ))}
          </div>
          <div className="date-range">
            <DateInput value={startDate} onChange={e => { setStartDate(e.target.value); setDateRange('custom'); }} />
            <span>—</span>
            <DateInput value={endDate} onChange={e => { setEndDate(e.target.value); setDateRange('custom'); }} />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        {[
          { icon: <DollarSign size={22} />, cls: 'primary', value: formatCurrency(totalRevenue), label: 'Ingresos totales', cur: totalRevenue, prev: prevRevenue },
          { icon: <ShoppingCart size={22} />, cls: 'success', value: totalSalesCount, label: 'Ventas realizadas', cur: totalSalesCount, prev: prevSalesCount },
          { icon: <TrendingUp size={22} />, cls: 'warning', value: formatCurrency(averageTicket), label: 'Ticket promedio', cur: averageTicket, prev: prevAvgTicket },
          { icon: <Package size={22} />, cls: 'info', value: totalProducts, label: 'Productos vendidos', cur: totalProducts, prev: prevTotalProducts },
        ].map(k => (
          <div key={k.label} className="kpi-card">
            <div className={`kpi-icon ${k.cls}`}>{k.icon}</div>
            <div className="kpi-content">
              <div className="kpi-value">{k.value}</div>
              <div className="kpi-label">{k.label}</div>
              <KpiDelta current={k.cur} prev={k.prev} />
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="chart-grid">
        <div className="chart-card">
          <div className="chart-card-title">🏆 Top 10 Productos más Vendidos</div>
          <div style={{ height: 300 }}>
            {top10Data.length > 0 ? (
              <Bar
                data={{ labels: top10Data.map(([n]) => n.length > 20 ? n.slice(0,18)+'…' : n), datasets: [{ data: top10Data.map(([,d]) => d.revenue), backgroundColor: chartColors, borderRadius: 6 }] }}
                options={{ ...defaultOptions, indexAxis: 'y', plugins: { ...defaultOptions.plugins, tooltip: { ...defaultOptions.plugins.tooltip, callbacks: { label: (ctx) => { const item = top10Data[ctx.dataIndex]; return `${formatCurrency(item[1].revenue)} (${item[1].qty} unid.)`; } } } } }}
              />
            ) : <div className="empty-state"><p>Sin datos en este período</p></div>}
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-card-title">📊 Ventas por Categoría</div>
          <div style={{ height: 300, display: 'flex', justifyContent: 'center' }}>
            {Object.keys(categoryData).length > 0 ? (
              <Doughnut
                data={{ labels: Object.keys(categoryData).map(k => k === 'vitrina' ? '🍰 Vitrina' : k === 'salados' ? '🥪 Salados' : k === 'encargo' ? '🎂 Encargo' : k), datasets: [{ data: Object.values(categoryData), backgroundColor: ['#C97B4B','#E8A87C','#C9A96E','#5B9BD5'], borderWidth: 0 }] }}
                options={{ ...defaultOptions, scales: undefined, plugins: { ...defaultOptions.plugins, legend: { display: true, position: 'bottom' }, tooltip: { ...defaultOptions.plugins.tooltip, callbacks: { label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.raw)}` } } } }}
              />
            ) : <div className="empty-state"><p>Sin datos</p></div>}
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-card-title">💳 Ventas por Método de Pago</div>
          <div style={{ height: 300, display: 'flex', justifyContent: 'center' }}>
            {Object.keys(paymentData).length > 0 ? (
              <Doughnut
                data={{ labels: Object.keys(paymentData).map(k => PAYMENT_LABELS[k] || k), datasets: [{ data: Object.values(paymentData), backgroundColor: ['#4CAF50','#5B9BD5','#C9A96E','#E74C3C'], borderWidth: 0 }] }}
                options={{ ...defaultOptions, scales: undefined, plugins: { ...defaultOptions.plugins, legend: { display: true, position: 'bottom' }, tooltip: { ...defaultOptions.plugins.tooltip, callbacks: { label: (ctx) => { const total = Object.values(paymentData).reduce((a,b)=>a+b,0); const pct = total > 0 ? ((ctx.raw/total)*100).toFixed(1) : 0; return ` ${ctx.label}: ${formatCurrency(ctx.raw)} (${pct}%)`; } } } } }}
              />
            ) : <div className="empty-state"><CreditCard size={32} /><p>Sin ventas en este período</p></div>}
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-card-title">👤 Rendimiento por Vendedor</div>
          <div style={{ height: 300 }}>
            {sellerPerformance.length > 0 ? (
              <Bar
                data={{ labels: sellerPerformance.map(s => s.name), datasets: [{ data: sellerPerformance.map(s => s.revenue), backgroundColor: chartColors, borderRadius: 6 }] }}
                options={{ ...defaultOptions, plugins: { ...defaultOptions.plugins, tooltip: { ...defaultOptions.plugins.tooltip, callbacks: { label: (ctx) => { const s = sellerPerformance[ctx.dataIndex]; return `${formatCurrency(s.revenue)} (${s.count} ventas)`; } } } } }}
              />
            ) : <div className="empty-state"><p>Sin datos</p></div>}
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-card-title">📅 Ventas por Día de Semana</div>
          <div style={{ height: 300 }}>
            <Bar data={{ labels: byDayOfWeek.labels, datasets: [{ data: byDayOfWeek.data, backgroundColor: '#C97B4B', borderRadius: 6 }] }} options={defaultOptions} />
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-card-title">📈 Tendencia Mensual (6 meses)</div>
          <div style={{ height: 300 }}>
            {monthlySales.data.length > 0 ? (
              <Bar data={{ labels: monthlySales.labels, datasets: [{ data: monthlySales.data, backgroundColor: '#5B9BD5', borderRadius: 6 }] }} options={defaultOptions} />
            ) : <div className="empty-state"><p>Sin datos suficientes</p></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
