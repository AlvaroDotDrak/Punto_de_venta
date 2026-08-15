import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../src/utils/api', () => ({
  default: { get: vi.fn() },
}));

import api from '../src/utils/api';
import ProductStatsModal from '../src/components/ProductStatsModal';

const STATS_VACIAS = {
  total_units: 0, total_revenue: 0, avg_units_per_day: 0,
  daily_trend: [], best_day_of_week: null, last_sale_at: null,
};

const MOVIMIENTOS = [
  { id: 3, type: 'merma', quantity: -2, stock_after: 25, notes: 'Vencido', seller_name: 'Cami', created_at: '2026-08-09T20:05:00' },
  { id: 2, type: 'venta', quantity: -1, stock_after: 27, notes: null, seller_name: 'Martina', created_at: '2026-08-09T13:45:00' },
  { id: 1, type: 'ingreso', quantity: 24, stock_after: 28, notes: 'Carga del día', seller_name: 'Macarena', created_at: '2026-08-09T11:20:00' },
];

/** El modal pide stats y movimientos por separado; se responde según la ruta. */
function mockApi({ movements = MOVIMIENTOS, stats = STATS_VACIAS } = {}) {
  api.get.mockImplementation((path) =>
    path.includes('/movements') ? Promise.resolve(movements) : Promise.resolve(stats)
  );
}

const ceviche = { id: 4, name: 'Ceviche Mixto 500 Grs', category: 'ceviches', stock: 25 };

describe('ProductStatsModal — historial de stock', () => {
  beforeEach(() => { api.get.mockReset(); });

  test('muestra la libreta con cantidad, saldo y responsable', async () => {
    mockApi();
    render(<ProductStatsModal product={ceviche} onClose={() => {}} />);

    expect(await screen.findByText('Movimientos de stock')).toBeDefined();
    expect(screen.getByText('Ingreso')).toBeDefined();
    expect(screen.getByText('+24')).toBeDefined();
    expect(screen.getByText('→ 28')).toBeDefined();
    expect(screen.getByText('Macarena')).toBeDefined();
  });

  test('traduce los tipos a lenguaje de mostrador', async () => {
    mockApi();
    render(<ProductStatsModal product={ceviche} onClose={() => {}} />);

    // 'merma' es jerga de sistema; en pantalla tiene que decir qué pasó.
    expect(await screen.findByText('Se botó')).toBeDefined();
    expect(screen.queryByText('merma')).toBeNull();
  });

  test('distingue lo que entra de lo que sale por el signo', async () => {
    mockApi();
    render(<ProductStatsModal product={ceviche} onClose={() => {}} />);

    expect(await screen.findByText('+24')).toBeDefined();
    expect(screen.getByText('-2')).toBeDefined();
    expect(screen.getByText('-1')).toBeDefined();
  });

  test('muestra el motivo junto al movimiento', async () => {
    mockApi();
    render(<ProductStatsModal product={ceviche} onClose={() => {}} />);

    expect(await screen.findByText(/Vencido/)).toBeDefined();
    expect(screen.getByText(/Carga del día/)).toBeDefined();
  });

  test('un saldo desconocido sale como guion, no como cero', async () => {
    // Las filas recuperadas del audit log no tienen stock_after: mostrar 0
    // haría creer que el stock quedó vacío ese día.
    mockApi({ movements: [{ id: 1, type: 'ingreso', quantity: 33, stock_after: null,
                            notes: 'Recuperado del registro de auditoría',
                            seller_name: 'Cami', created_at: '2026-08-08T11:27:00' }] });
    render(<ProductStatsModal product={ceviche} onClose={() => {}} />);

    expect(await screen.findByText('—')).toBeDefined();
    expect(screen.queryByText('→ 0')).toBeNull();
  });

  test('avisa cuando todavía no hay movimientos', async () => {
    mockApi({ movements: [] });
    render(<ProductStatsModal product={ceviche} onClose={() => {}} />);

    expect(await screen.findByText('Todavía no hay movimientos registrados.')).toBeDefined();
  });

  test('no pide el historial de un producto sin inventario', async () => {
    mockApi();
    const cafe = { id: 9, name: 'Café', category: 'cafe', stock: null };
    render(<ProductStatsModal product={cafe} onClose={() => {}} />);

    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(api.get.mock.calls.some(([p]) => p.includes('/movements'))).toBe(false);
    expect(screen.queryByText('Movimientos de stock')).toBeNull();
  });

  test('si el historial falla, el resto del modal sigue en pie', async () => {
    api.get.mockImplementation((path) =>
      path.includes('/movements') ? Promise.reject(new Error('500'))
                                  : Promise.resolve(STATS_VACIAS)
    );
    render(<ProductStatsModal product={ceviche} onClose={() => {}} />);

    expect(await screen.findByText('Ceviche Mixto 500 Grs')).toBeDefined();
    expect(await screen.findByText('Todavía no hay movimientos registrados.')).toBeDefined();
  });
});
