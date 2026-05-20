/**
 * Dashboard — Pastelería Tía Julia
 * V5.0: Enhanced Insights Edition
 */
import { useState, useMemo, useEffect } from 'react';
import api from '../utils/api';
import { formatCurrency } from '../utils/formatters';
import {
  BarChart3, TrendingUp, ShoppingCart, DollarSign, Package,
  ArrowUpRight, ArrowDownRight, CreditCard, Calendar, Users,
  Layers, Coffee, Clock, ChevronDown, ChevronUp, Filter
} from 'lucide-react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import DateInput from '../components/DateInput';
import { format, subDays, startOfDay, endOfDay, getDay, getHours } from 'date-fns';
import { es } from 'date-fns/locale';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler);

const chartColors = ['#BF5A2F','#C9923A','#E0BC82','#5B9BD5','#4CAF50','#F5A623','#E74C3C','#9B59B6','#1ABC9C','#34495E'];
const PAYMENT_LABELS = { efectivo: '💵 Efectivo', tarjeta: '💳 Tarjeta', transferencia: '🏦 Transferencia' };

const defaultOptions = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { 
      backgroundColor: 'rgba(45, 32, 22, 0.95)', 
      titleFont: { family: 'Plus Jakarta Sans', weight: 'bold' }, 
      bodyFont: { family: 'Plus Jakarta Sans' }, 
      cornerRadius: 12, 
      padding: 14,
      displayColors: true,
      boxPadding: 6
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { family: 'Plus Jakarta Sans', size: 11, weight: 600 }, color: '#888' } },
    y: { grid: { color: 'rgba(0,0,0,0.03)', drawBorder: false }, ticks: { font: { family: 'Plus Jakarta Sans', size: 11 }, color: '#888' } },
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
  if (prev === 0) return <span style={{ fontSize: '0.72rem', color: 'var(--color-success)', fontWeight: 700, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><ArrowUpRight size={12} /> Nuevo período</span>;
  const delta = ((current - prev) / prev) * 100;
  const up = delta >= 0;
  return (
    <span style={{ 
      fontSize: '0.75rem', 
      color: up ? 'var(--color-success)' : 'var(--color-danger)', 
      fontWeight: 700, 
      marginTop: 6, 
      display: 'flex', 
      alignItems: 'center', 
      gap: 4,
      background: up ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
      padding: '2px 8px',
      borderRadius: 'var(--radius-full)',
      width: 'fit-content'
    }}>
      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />} {Math.abs(delta).toFixed(1)}%
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

  // Top Products State
  const [topSortBy, setTopSortBy] = useState('revenue'); // 'revenue' | 'qty'
  const [topLimit, setTopLimit] = useState(10); // 10 | 50

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

  // Top Products Data
  const topProductsData = useMemo(() => {
    const map = {};
    currentItems.forEach(i => {
      if (!map[i.product_name]) map[i.product_name] = { qty: 0, revenue: 0 };
      map[i.product_name].qty += i.quantity;
      map[i.product_name].revenue += i.subtotal;
    });
    return Object.entries(map)
      .sort((a, b) => topSortBy === 'revenue' ? b[1].revenue - a[1].revenue : b[1].qty - a[1].qty)
      .slice(0, topLimit);
  }, [currentItems, topSortBy, topLimit]);

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

  const categoryEmojis = { vitrina: '🍰', salados: '🥪', encargo: '🎂', bebidas: '🥤', cafe: '☕' };

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

  // Por Hora
  const byHourData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const counts = new Array(24).fill(0);
    currentSales.forEach(s => {
      const h = getHours(new Date(s.created_at));
      counts[h] += s.total;
    });
    // Truncar horas sin ventas extremas para mejor visualización si es necesario
    const startHour = Math.max(0, Math.min(...currentSales.map(s => getHours(new Date(s.created_at)))) - 1);
    const endHour = Math.min(23, Math.max(...currentSales.map(s => getHours(new Date(s.created_at)))) + 1);
    
    return {
      labels: hours.slice(startHour, endHour + 1).map(h => `${h}:00`),
      data: counts.slice(startHour, endHour + 1)
    };
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
    <div className="animate-fade-in" style={{ paddingBottom: 'var(--space-2xl)' }}>
      <div className="page-header" style={{ marginBottom: 'var(--space-2xl)' }}>
        <div>
          <h1 className="page-title text-display" style={{ fontSize: '2.2rem', marginBottom: 4 }}>
            <BarChart3 size={32} style={{ verticalAlign: 'middle', marginRight: 12, color: 'var(--color-primary)' }} />
            Panel de Control
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>Resumen analítico de Pastelería Tía Julia.</p>
        </div>
        
        <div className="card glass noise-overlay" style={{ padding: 'var(--space-md)', display: 'flex', gap: 'var(--space-md)', alignItems: 'center', flexWrap: 'wrap', border: 'none' }}>
          <div className="quick-filters" style={{ border: 'none', background: 'var(--color-bg)', padding: 4, borderRadius: 'var(--radius-md)' }}>
            {[['1d','Hoy'],['7d','7d'],['30d','30d'],['90d','90d']].map(([key, label]) => (
              <button key={key} 
                className={`quick-filter ${dateRange === key ? 'active' : ''}`} 
                onClick={() => setDateRange(key)}
                style={{ borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: '0.85rem' }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="date-range" style={{ gap: 8 }}>
            <Calendar size={16} style={{ opacity: 0.5 }} />
            <DateInput value={startDate} onChange={e => { setStartDate(e.target.value); setDateRange('custom'); }} />
            <span style={{ opacity: 0.3 }}>—</span>
            <DateInput value={endDate} onChange={e => { setEndDate(e.target.value); setDateRange('custom'); }} />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        {[
          { icon: <DollarSign size={24} />, cls: 'primary', value: formatCurrency(totalRevenue), label: 'Ingresos Totales', cur: totalRevenue, prev: prevRevenue },
          { icon: <ShoppingCart size={24} />, cls: 'success', value: totalSalesCount, label: 'Ventas Totales', cur: totalSalesCount, prev: prevSalesCount },
          { icon: <TrendingUp size={24} />, cls: 'warning', value: formatCurrency(averageTicket), label: 'Ticket Promedio', cur: averageTicket, prev: prevAvgTicket },
          { icon: <Package size={24} />, cls: 'info', value: totalProducts, label: 'Items Vendidos', cur: totalProducts, prev: prevTotalProducts },
        ].map((k, idx) => (
          <div key={k.label} className={`kpi-card glass noise-overlay stagger-${(idx % 4) + 1}`} style={{ border: 'none' }}>
            <div className={`kpi-icon ${k.cls}`} style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>{k.icon}</div>
            <div className="kpi-content">
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value text-display">{k.value}</div>
              <KpiDelta current={k.cur} prev={k.prev} />
            </div>
          </div>
        ))}
      </div>

      {/* Main Charts Row */}
      <div className="chart-grid">
        {/* Sales by Hour */}
        <div className="chart-card glass noise-overlay animate-slide-up" style={{ border: 'none', gridColumn: 'span 2' }}>
          <div className="chart-card-title text-display">
            <span style={{ background: 'var(--color-primary-bg)', padding: 8, borderRadius: 'var(--radius-md)' }}>⏰</span>
            Flujo de Ventas por Hora
          </div>
          <div style={{ height: 300 }}>
            <Line 
              data={{ 
                labels: byHourData.labels, 
                datasets: [{ 
                  label: 'Ventas',
                  data: byHourData.data, 
                  borderColor: 'var(--color-primary)',
                  backgroundColor: 'rgba(191, 90, 47, 0.1)',
                  fill: true,
                  tension: 0.4,
                  pointRadius: 4,
                  pointHoverRadius: 6,
                  borderWidth: 3
                }] 
              }} 
              options={{
                ...defaultOptions,
                plugins: {
                  ...defaultOptions.plugins,
                  tooltip: {
                    ...defaultOptions.plugins.tooltip,
                    callbacks: {
                      label: (ctx) => ` Ingresos: ${formatCurrency(ctx.raw)}`
                    }
                  }
                }
              }} 
            />
          </div>
        </div>

        {/* Top Products (Expandable) */}
        <div className="chart-card glass noise-overlay animate-slide-up" style={{ border: 'none', gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)' }}>
            <div className="chart-card-title text-display" style={{ marginBottom: 0 }}>
              <span style={{ background: 'var(--color-primary-bg)', padding: 8, borderRadius: 'var(--radius-md)' }}>🏆</span>
              Top Productos Vendidos
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="quick-filters" style={{ border: 'none', background: 'var(--color-bg)', padding: 4, borderRadius: 'var(--radius-md)' }}>
                <button 
                  className={`quick-filter ${topSortBy === 'revenue' ? 'active' : ''}`} 
                  onClick={() => setTopSortBy('revenue')}
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                >
                  <DollarSign size={14} style={{ marginRight: 4 }} /> Por Ganancia
                </button>
                <button 
                  className={`quick-filter ${topSortBy === 'qty' ? 'active' : ''}`} 
                  onClick={() => setTopSortBy('qty')}
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                >
                  <Package size={14} style={{ marginRight: 4 }} /> Por Unidades
                </button>
              </div>
              <button 
                className="btn btn-ghost btn-sm" 
                onClick={() => setTopLimit(topLimit === 10 ? 50 : 10)}
                style={{ fontSize: '0.75rem', gap: 4 }}
              >
                {topLimit === 10 ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                {topLimit === 10 ? 'Ver más' : 'Ver menos'}
              </button>
            </div>
          </div>
          
          <div style={{ height: topLimit === 10 ? 340 : 600, overflowY: topLimit > 10 ? 'auto' : 'hidden', paddingRight: 8 }}>
            {topProductsData.length > 0 ? (
              <Bar
                data={{ 
                  labels: topProductsData.map(([n]) => n.length > 25 ? n.slice(0,22)+'…' : n), 
                  datasets: [{ 
                    data: topProductsData.map(([,d]) => topSortBy === 'revenue' ? d.revenue : d.qty), 
                    backgroundColor: chartColors, 
                    borderRadius: 8,
                    hoverBackgroundColor: chartColors.map(c => c + 'CC')
                  }] 
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
                          const item = topProductsData[ctx.dataIndex]; 
                          return topSortBy === 'revenue' 
                            ? ` ${formatCurrency(item[1].revenue)} (${item[1].qty} unid.)`
                            : ` ${item[1].qty} unidades (${formatCurrency(item[1].revenue)})`; 
                        } 
                      } 
                    } 
                  } 
                }}
              />
            ) : <div className="empty-state"><Package className="icon" size={40} /><p>Sin datos</p></div>}
          </div>
        </div>

        {/* Categories */}
        <div className="chart-card glass noise-overlay animate-slide-up" style={{ border: 'none' }}>
          <div className="chart-card-title text-display">
            <span style={{ background: 'var(--color-primary-bg)', padding: 8, borderRadius: 'var(--radius-md)' }}>📊</span>
            Categorías
          </div>
          <div style={{ height: 340, display: 'flex', justifyContent: 'center' }}>
            {Object.keys(categoryData).length > 0 ? (
              <Doughnut
                data={{ 
                  labels: Object.keys(categoryData).map(k => `${categoryEmojis[k] || '📦'} ${k.charAt(0).toUpperCase() + k.slice(1)}`), 
                  datasets: [{ 
                    data: Object.values(categoryData), 
                    backgroundColor: ['#BF5A2F','#C9923A','#E0BC82','#5B9BD5','#4CAF50'], 
                    borderWidth: 4,
                    borderColor: '#ffffff',
                    hoverOffset: 15
                  }] 
                }}
                options={{ 
                  ...defaultOptions, 
                  scales: undefined, 
                  plugins: { 
                    ...defaultOptions.plugins, 
                    legend: { 
                      display: true, 
                      position: 'bottom', 
                      labels: { usePointStyle: true, padding: 20, font: { family: 'Plus Jakarta Sans', size: 12, weight: 600 } } 
                    } 
                  } 
                }}
              />
            ) : <div className="empty-state"><Layers className="icon" size={40} /><p>Sin datos</p></div>}
          </div>
        </div>

        {/* Payments */}
        <div className="chart-card glass noise-overlay animate-slide-up" style={{ border: 'none' }}>
          <div className="chart-card-title text-display">
            <span style={{ background: 'var(--color-primary-bg)', padding: 8, borderRadius: 'var(--radius-md)' }}>💳</span>
            Pagos
          </div>
          <div style={{ height: 340, display: 'flex', justifyContent: 'center' }}>
            {Object.keys(paymentData).length > 0 ? (
              <Doughnut
                data={{ 
                  labels: Object.keys(paymentData).map(k => PAYMENT_LABELS[k] || k), 
                  datasets: [{ 
                    data: Object.values(paymentData), 
                    backgroundColor: ['#4CAF50','#5B9BD5','#C9923A','#BF5A2F'], 
                    borderWidth: 4,
                    borderColor: '#ffffff',
                    hoverOffset: 15
                  }] 
                }}
                options={{ 
                  ...defaultOptions, 
                  scales: undefined, 
                  plugins: { 
                    ...defaultOptions.plugins, 
                    legend: { 
                      display: true, 
                      position: 'bottom', 
                      labels: { usePointStyle: true, padding: 20, font: { family: 'Plus Jakarta Sans', size: 12, weight: 600 } } 
                    } 
                  } 
                }}
              />
            ) : <div className="empty-state"><CreditCard className="icon" size={40} /><p>Sin ventas</p></div>}
          </div>
        </div>

        {/* Sellers */}
        <div className="chart-card glass noise-overlay animate-slide-up" style={{ border: 'none' }}>
          <div className="chart-card-title text-display">
            <span style={{ background: 'var(--color-primary-bg)', padding: 8, borderRadius: 'var(--radius-md)' }}>👤</span>
            Vendedores
          </div>
          <div style={{ height: 340 }}>
            {sellerPerformance.length > 0 ? (
              <Bar
                data={{ 
                  labels: sellerPerformance.map(s => s.name), 
                  datasets: [{ 
                    data: sellerPerformance.map(s => s.revenue), 
                    backgroundColor: 'var(--color-primary)', 
                    borderRadius: 8
                  }] 
                }}
                options={defaultOptions}
              />
            ) : <div className="empty-state"><Users className="icon" size={40} /><p>Sin datos</p></div>}
          </div>
        </div>

        {/* Monthly Trend */}
        <div className="chart-card glass noise-overlay animate-slide-up" style={{ border: 'none' }}>
          <div className="chart-card-title text-display">
            <span style={{ background: 'var(--color-primary-bg)', padding: 8, borderRadius: 'var(--radius-md)' }}>📈</span>
            Tendencia
          </div>
          <div style={{ height: 340 }}>
            {monthlySales.data.length > 0 ? (
              <Bar 
                data={{ 
                  labels: monthlySales.labels, 
                  datasets: [{ 
                    data: monthlySales.data, 
                    backgroundColor: '#BF5A2F', 
                    borderRadius: 8
                  }] 
                }} 
                options={defaultOptions} 
              />
            ) : <div className="empty-state"><Coffee className="icon" size={40} /><p>Sin histórico</p></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
