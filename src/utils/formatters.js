/**
 * Utilidades de formato
 * Moneda CLP, fechas, tiempos transcurridos
 */
import { format, formatDistanceToNow, differenceInHours, differenceInMinutes, isToday, isYesterday, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Formatea un número como moneda chilena (CLP)
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Formatea una fecha para mostrar
 */
export function formatDate(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? parseISO(date) : new Date(date);
  if (isToday(d)) return `Hoy, ${format(d, 'HH:mm', { locale: es })}`;
  if (isYesterday(d)) return `Ayer, ${format(d, 'HH:mm', { locale: es })}`;
  return format(d, "dd MMM yyyy, HH:mm", { locale: es });
}

/**
 * Formatea una fecha corta
 */
export function formatShortDate(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? parseISO(date) : new Date(date);
  return format(d, 'dd/MM/yyyy', { locale: es });
}

/**
 * Formatea tiempo transcurrido ("hace 2 horas")
 */
export function formatTimeAgo(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? parseISO(date) : new Date(date);
  return formatDistanceToNow(d, { addSuffix: true, locale: es });
}

/**
 * Calcula horas transcurridas desde una fecha
 */
export function hoursElapsed(date) {
  if (!date) return 0;
  const d = typeof date === 'string' ? parseISO(date) : new Date(date);
  return differenceInHours(new Date(), d);
}

/**
 * Calcula minutos transcurridos desde una fecha
 */
export function minutesElapsed(date) {
  if (!date) return 0;
  const d = typeof date === 'string' ? parseISO(date) : new Date(date);
  return differenceInMinutes(new Date(), d);
}

/**
 * Devuelve el estado del semáforo de frescura
 * @returns 'fresh' | 'warning' | 'danger'
 */
export function getFreshnessStatus(placedAt, maxHours = 48) {
  const hours = hoursElapsed(placedAt);
  if (hours < maxHours * 0.5) return 'fresh';     // Verde: primera mitad del tiempo
  if (hours < maxHours) return 'warning';           // Amarillo: segunda mitad
  return 'danger';                                   // Rojo: superó el máximo
}

/**
 * Formatea tiempo transcurrido como "Xh Ym"
 */
export function formatElapsedTime(date) {
  if (!date) return '0h 0m';
  const totalMinutes = minutesElapsed(date);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/**
 * Formatea tiempo restante hasta vencimiento
 * @returns "Vence en 2h 15m" | "Venció hace 30m"
 */
export function formatTimeRemaining(date, maxHours = 48) {
  if (!date) return '';
  const elapsed = minutesElapsed(date);
  const maxMinutes = maxHours * 60;
  const remaining = maxMinutes - elapsed;

  const fmt = (mins) => {
    const h = Math.floor(Math.abs(mins) / 60);
    const m = Math.abs(mins) % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  if (remaining <= 0) return `Venció hace ${fmt(remaining)}`;
  return `Vence en ${fmt(remaining)}`;
}

/**
 * Obtiene nombre del día de la semana
 */
export function getDayName(date) {
  const d = typeof date === 'string' ? parseISO(date) : new Date(date);
  return format(d, 'EEEE', { locale: es });
}

/**
 * Formatea hora del día
 */
export function getHourLabel(hour) {
  return `${hour.toString().padStart(2, '0')}:00`;
}
