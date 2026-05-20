import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import RecipeModal from '../src/components/Productos/RecipeModal';

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn()
};

vi.mock('../src/context/ToastContext', () => ({
  useToast: () => mockToast
}));

describe('RecipeModal Component', () => {
  const mockProduct = {
    id: 1,
    name: 'Torta de Manzana',
    category: 'pasteleria'
  };

  const mockIngredients = [
    { id: 1, name: 'Harina', unit: 'kg', last_price: 1000 },
    { id: 2, name: 'Huevo', unit: 'unidad', last_price: 200 }
  ];

  const mockRecipe = [
    {
      ingredient_id: 1,
      ingredient_name: 'Harina',
      quantity: 2,
      ingredient_unit: 'kg',
      yield_qty: 10
    },
    {
      ingredient_id: 2,
      ingredient_name: 'Huevo',
      quantity: 1,
      ingredient_unit: 'docena',
      yield_qty: 10
    }
  ];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('calculates correct batch cost and cost per unit with yield', async () => {
    const fetchMock = vi.fn((url) => {
      const urlStr = typeof url === 'string' ? url : url.url;
      if (urlStr.includes('/ingredients')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockIngredients)
        });
      }
      if (urlStr.includes('/recipe')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockRecipe)
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([])
      });
    });

    vi.stubGlobal('fetch', fetchMock);
    if (typeof window !== 'undefined') {
      window.fetch = fetchMock;
    }

    render(<RecipeModal product={mockProduct} onClose={() => {}} />);

    // Wait for the loader to disappear
    await waitFor(() => {
      expect(screen.queryByText(/Cargando/)).toBeNull();
    });

    // Check if the table and total costs are rendered
    expect(screen.getByText('Harina')).toBeDefined();
    expect(screen.getByText('Huevo')).toBeDefined();

    // Check total batch cost (should contain 4.400 or 4,400)
    expect(screen.getByText(/4[.,]400/)).toBeDefined();

    // Check cost per unit (should contain 440)
    expect(screen.getByText(/440/)).toBeDefined();

    // Change yield_qty to 5
    const yieldInput = screen.getByDisplayValue('10');
    fireEvent.change(yieldInput, { target: { value: '5' } });

    // Cost per unit should now update to $4.400 / 5 = $880
    await waitFor(() => {
      expect(screen.getByText(/880/)).toBeDefined();
    });
  });

  test('handles unit conversion errors gracefully', async () => {
    // Harina has unit 'kg' but recipe tries to use 'unidad' (incompatible)
    const mockIncompatibleRecipe = [
      {
        ingredient_id: 1,
        ingredient_name: 'Harina',
        quantity: 10,
        ingredient_unit: 'unidad',
        yield_qty: 1
      }
    ];

    const fetchMock = vi.fn((url) => {
      const urlStr = typeof url === 'string' ? url : url.url;
      if (urlStr.includes('/ingredients')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockIngredients)
        });
      }
      if (urlStr.includes('/recipe')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockIncompatibleRecipe)
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([])
      });
    });

    vi.stubGlobal('fetch', fetchMock);
    if (typeof window !== 'undefined') {
      window.fetch = fetchMock;
    }

    render(<RecipeModal product={mockProduct} onClose={() => {}} />);

    // Wait for the loader to disappear
    await waitFor(() => {
      expect(screen.queryByText(/Cargando/)).toBeNull();
    });

    // It should display 'Unidades incompatibles' warning
    expect(screen.getByText(/Unidades incompatibles/)).toBeDefined();
  });
});
