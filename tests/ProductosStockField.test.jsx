import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const toast = { success: vi.fn(), error: vi.fn() };

vi.mock('../src/utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../src/context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../src/context/SellerContext', () => ({
  useSeller: () => ({ currentSeller: { id: 1, name: 'Cami', products_access: 'full' }, isAdmin: true }),
}));

// Referencia estable: alimenta memos que disparan la carga de productos.
const CATEGORIAS = [{ value: 'ceviches', label: 'Ceviches', emoji: '🐟', stock: true, showcase: false }];
const CONFIG = {
  categories: CATEGORIAS,
  hasCapability: () => false,
  t: (_k, fallback) => fallback,
  branding: {},
};
vi.mock('../src/context/ConfigContext', () => ({ useConfig: () => CONFIG }));

import api from '../src/utils/api';
import Productos from '../src/pages/Productos';

// Productos usa <Link>: sin Router el componente revienta al montar.
const renderPagina = () => render(<MemoryRouter><Productos /></MemoryRouter>);

const CEVICHE = {
  id: 4, name: 'Ceviche Mixto 500 Grs', category: 'ceviches', price: 8500,
  cost_price: null, slices: 8, slice_price: null, max_showcase_hours: 48,
  sold_by: 'unit', stock: 25, min_stock_cooler: 3, barcode: null,
  photo: null, active: true,
};

async function abrirFichaDe(producto) {
  api.get.mockResolvedValue([producto]);
  renderPagina();
  fireEvent.click(await screen.findByTitle(/Editar/i));
  await screen.findByDisplayValue(producto.name);
}

describe('Productos — la ficha no mueve inventario', () => {
  beforeEach(() => {
    api.get.mockReset(); api.patch.mockReset(); api.post.mockReset();
    toast.success.mockReset(); toast.error.mockReset();
    api.patch.mockResolvedValue({ ...CEVICHE });
    api.post.mockResolvedValue({ ...CEVICHE });
  });

  test('al editar no hay campo de stock', async () => {
    await abrirFichaDe(CEVICHE);

    // El input existía y era la puerta de atrás: mover inventario obligaba a
    // abrir la ficha, donde también están el nombre y el precio.
    expect(screen.queryByLabelText(/Stock inicial/i)).toBeNull();
    expect(screen.queryByDisplayValue('25')).toBeNull();
  });

  test('al editar explica dónde se mueve el stock', async () => {
    await abrirFichaDe(CEVICHE);

    expect(screen.getByText(/Reponer/)).toBeDefined();
    expect(screen.getByText(/Merma/)).toBeDefined();
    expect(screen.getByText(/Ajustar/)).toBeDefined();
  });

  test('guardar una edición no manda stock al backend', async () => {
    await abrirFichaDe(CEVICHE);

    fireEvent.change(screen.getByDisplayValue('8500'), { target: { value: '9000' } });
    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    const [ruta, payload] = api.patch.mock.calls[0];
    expect(ruta).toBe('/products/4');
    expect(payload.price).toBe(9000);
    expect('stock' in payload).toBe(false);
  });

  test('al crear sí se puede fijar el stock inicial', async () => {
    api.get.mockResolvedValue([]);
    renderPagina();
    fireEvent.click(await screen.findByText(/Nuevo Producto/i));

    // Sin esto no habría forma de dar de alta un producto con inventario.
    expect(await screen.findByText(/Stock inicial/i)).toBeDefined();
  });

  test('el stock inicial viaja solo en el alta', async () => {
    api.get.mockResolvedValue([]);
    const { container } = renderPagina();
    fireEvent.click(await screen.findByText(/Nuevo Producto/i));

    // El form no asocia labels con htmlFor, así que se seleccionan por clase.
    // La categoría son botones, no un select.
    fireEvent.change(container.querySelector('.form-input-lg'), { target: { value: 'Ceviche Nuevo' } });
    fireEvent.click(container.querySelector('.category-btn'));
    fireEvent.change(container.querySelector('.form-input-price'), { target: { value: '9000' } });
    fireEvent.change(await screen.findByPlaceholderText('0'), { target: { value: '12' } });
    fireEvent.click(screen.getByText('Crear'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1].stock).toBe(12);
  });
});
