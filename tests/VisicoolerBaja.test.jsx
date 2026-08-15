import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const toast = { success: vi.fn(), error: vi.fn() };

vi.mock('../src/utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() },
}));
vi.mock('../src/context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../src/context/SellerContext', () => ({
  useSeller: () => ({ currentSeller: { id: 1, name: 'Macarena', products_access: 'full' }, isAdmin: true }),
}));
// La referencia tiene que ser estable: `stockCats` es un useMemo sobre
// `categories` y alimenta el efecto que carga los productos. Un array nuevo en
// cada render dispara el efecto para siempre y el test se cuelga. El
// ConfigContext real devuelve un valor de estado, así que esto solo pasa acá.
const CATEGORIAS = [{ value: 'ceviches', label: 'Ceviches', emoji: '🐟', stock: true }];
const CONFIG = { categories: CATEGORIAS, t: (_k, fallback) => fallback };

vi.mock('../src/context/ConfigContext', () => ({ useConfig: () => CONFIG }));

import api from '../src/utils/api';
import Visicooler from '../src/pages/Visicooler';

const CEVICHE = {
  id: 4, name: 'Ceviche Mixto 500 Grs', category: 'ceviches',
  price: 8500, stock: 10, min_stock_cooler: 3, sold_by: 'unit', active: true,
};

async function abrirModalBaja(producto = CEVICHE) {
  api.get.mockResolvedValue([producto]);
  render(<Visicooler />);
  fireEvent.click(await screen.findByTitle(/Dar de baja/));
  return screen.findByText('Dar de baja');
}

describe('Visicooler — merma y ajuste', () => {
  beforeEach(() => {
    api.get.mockReset(); api.post.mockReset();
    toast.success.mockReset(); toast.error.mockReset();
    api.post.mockResolvedValue({ ...CEVICHE, stock: 7 });
  });

  test('la merma llama a writeoff con la cantidad botada', async () => {
    await abrirModalBaja();

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '3' } });
    fireEvent.change(screen.getByPlaceholderText(/Vencido/), { target: { value: 'Se pasó de fecha' } });
    fireEvent.click(screen.getByText('Confirmar'));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/products/4/writeoff', { quantity: 3, reason: 'Se pasó de fecha' }
    ));
  });

  test('el ajuste manda lo contado, no la diferencia', async () => {
    await abrirModalBaja();
    fireEvent.click(screen.getByText('Conté y no cuadra'));

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '7' } });
    fireEvent.change(screen.getByPlaceholderText(/Se contó/), { target: { value: 'Conteo físico' } });
    fireEvent.click(screen.getByText('Confirmar'));

    // 7 es el stock real, no "restar 7". Confundirlos deja el inventario al revés.
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/products/4/adjust', { counted: 7, reason: 'Conteo físico' }
    ));
  });

  test('sin motivo no se envía nada', async () => {
    await abrirModalBaja();

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '3' } });
    fireEvent.click(screen.getByText('Confirmar'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(api.post).not.toHaveBeenCalled();
  });

  test('un motivo de menos de 3 letras tampoco pasa', async () => {
    await abrirModalBaja();

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '3' } });
    fireEvent.change(screen.getByPlaceholderText(/Vencido/), { target: { value: 'ok' } });
    fireEvent.click(screen.getByText('Confirmar'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(api.post).not.toHaveBeenCalled();
  });

  test('una cantidad vacía o negativa no se envía', async () => {
    await abrirModalBaja();

    fireEvent.change(screen.getByPlaceholderText(/Vencido/), { target: { value: 'Vencido' } });
    fireEvent.click(screen.getByText('Confirmar'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '-4' } });
    fireEvent.click(screen.getByText('Confirmar'));

    expect(api.post).not.toHaveBeenCalled();
  });

  test('anticipa en cuánto queda el stock antes de confirmar', async () => {
    await abrirModalBaja();

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '4' } });
    expect(await screen.findByText('6')).toBeDefined();     // merma: 10 − 4

    fireEvent.click(screen.getByText('Conté y no cuadra'));
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '4' } });
    expect(await screen.findByText('4')).toBeDefined();     // ajuste: queda en lo contado
  });

  test('cambiar de modo limpia la cantidad tipeada', async () => {
    await abrirModalBaja();

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '3' } });
    fireEvent.click(screen.getByText('Conté y no cuadra'));

    // Arrastrar el 3 significaría "quedan 3" cuando la cajera quiso decir "botá 3".
    expect(screen.getByPlaceholderText('0').value).toBe('');
  });

  test('si el backend rechaza, avisa y no cierra el modal', async () => {
    api.post.mockRejectedValue(new Error('Solo hay 10 en stock'));
    await abrirModalBaja();

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '99' } });
    fireEvent.change(screen.getByPlaceholderText(/Vencido/), { target: { value: 'Vencido' } });
    fireEvent.click(screen.getByText('Confirmar'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByText('Dar de baja')).toBeDefined();
  });

  test('tras dar de baja recarga los productos', async () => {
    await abrirModalBaja();
    const llamadasIniciales = api.get.mock.calls.length;

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '2' } });
    fireEvent.change(screen.getByPlaceholderText(/Vencido/), { target: { value: 'Vencido' } });
    fireEvent.click(screen.getByText('Confirmar'));

    await waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThan(llamadasIniciales));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });
});
