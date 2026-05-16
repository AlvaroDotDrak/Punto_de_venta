import { useState, useEffect } from 'react';
import { X, TrendingUp, ShoppingCart, DollarSign, Calendar, Clock } from 'lucide-react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/formatters';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const RANGES = [
  { id: '7d',  label: '7 días' },
  { id: '30d', label: '30 días' },
  { id: '90d', label: '3 meses' },
  { id: 'all', label: 'Todo' },
];

const categoryEmoji = { vitrina: '🍰', salados: '🥪', encargo: '🎂', bebidas: '🥤', cafe: '☕' };

function rangeToParams(rangeId) {
  const now = new Date();
  if (rangeId === 'all') return {};
  const days = { '7d': 7, '30d': 30, '90d': 90 }[rangeId];
  return {
    date_from: format(subDays(now, days), 'yyyy-MM-dd'),
    date_to: format(now, 'yyyy-MM-dd'),
  };
}

export default function ProductStatsModal({ product, onClose }) {
  const [range, setRange] = useState('30d');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setStats(null);
    const params = rangeToParams(range);
    const qs = new URLSearchParams(params).toString();
    api.get(`/products/${product.id}/stats${qs ? '?' + qs : ''}`)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [product.id, range]);

  const chartData = stats?.daily_trend?.length ? {
    labels: stats.daily_trend.map(d =>
      format(new Date(d.date + 'T00:00:00'), 'd MMM', { locale: es })
    ),
    datasets: [{
      label: 'Unidades',
      data: stats.daily_trend.map(d => d.units),
      backgroundColor: '#C97B4B',
      borderRadius: 4,
      borderSkipped: false,
    }],
  } : null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#2D2016',
        cornerRadius: 8,
        padding: 10,
        callbacks: {
          label: (ctx) => {
            const day = stats.daily_trend[ctx.dataIndex];
            return [`${ctx.raw} uds`, formatCurrency(day.revenue)];
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 45 } },
      y: {
        grid: { color: 'rgba(0,0,0,0.05)' },
        ticks: { font: { size: 11 }, stepSize: 1 },
        beginAtZero: true,
      },
    },
  };

  const empty = stats && stats.total_units === 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>

        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{categoryEmoji[product.category] || '📦'}</span>
            {product.name}
          </h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>

          {/* Selector de rango */}
          <div className="tabs" style={{ alignSelf: 'flex-start' }}>
            {RANGES.map(r => (
              <button
                key={r.id}
                className={`tab ${range === r.id ? 'active' : ''}`}
                onClick={() => setRange(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-light)' }}>
              Cargando estadísticas...
            </div>
          )}

          {!loading && empty && (
            <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-light)' }}>
              Sin ventas registradas en este período.
            </div>
          )}

          {!loading && stats && !empty && (
            <>
              {/* KPI cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-md)' }}>
                <StatCard
                  icon={<ShoppingCart size={18} />}
                  label="Unidades vendidas"
                  value={stats.total_units}
                />
                <StatCard
                  icon={<DollarSign size={18} />}
                  label="Revenue total"
                  value={formatCurrency(stats.total_revenue)}
                />
                <StatCard
                  icon={<TrendingUp size={18} />}
                  label="Promedio / día"
                  value={`${stats.avg_units_per_day} uds`}
                />
              </div>

              {/* Gráfico de tendencia */}
              {chartData && (
                <div>
                  <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Tendencia de ventas
                  </p>
                  <div style={{ height: 180 }}>
                    <Bar data={chartData} options={chartOptions} />
                  </div>
                </div>
              )}

              {/* Desglose vitrina */}
              {stats.by_showcase_type && (
                <div>
                  <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Vendido por tipo
                  </p>
                  <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                    <ShowcasePill label="Enteros" count={stats.by_showcase_type.entero} color="var(--color-primary)" />
                    <ShowcasePill label="Trozos" count={stats.by_showcase_type.trozado} color="#5B9BD5" />
                  </div>
                </div>
              )}

              {/* Día favorito + última venta */}
              <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
                {stats.best_day_of_week && (
                  <InfoPill
                    icon={<Calendar size={14} />}
                    label="Mejor día"
                    value={`${stats.best_day_of_week.day} (${stats.best_day_of_week.units} uds)`}
                  />
                )}
                {stats.last_sale_at && (
                  <InfoPill
                    icon={<Clock size={14} />}
                    label="Última venta"
                    value={formatDate(stats.last_sale_at)}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <div style={{
      background: 'var(--color-bg)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-md)',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{ color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon}
        <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-light)' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--color-text)' }}>
        {value}
      </div>
    </div>
  );
}

function ShowcasePill({ label, count, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'var(--color-bg)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', padding: '8px 14px',
    }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{label}:</span>
      <strong style={{ fontSize: '0.95rem' }}>{count}</strong>
    </div>
  );
}

function InfoPill({ icon, label, value }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: 'var(--color-bg)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', padding: '8px 14px', flex: 1, minWidth: 160,
    }}>
      <span style={{ color: 'var(--color-primary)' }}>{icon}</span>
      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', whiteSpace: 'nowrap' }}>{label}:</span>
      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{value}</span>
    </div>
  );
}
