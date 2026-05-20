import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RestockPanel from '../src/components/RestockPanel';

describe('RestockPanel Component', () => {
  const mockSuggestions = [
    {
      ingredient_id: 1,
      name: 'Harina',
      current_stock: 5,
      min_stock: 10,
      suggested_qty: 15,
      unit: 'kg',
      estimated_cost: 15000
    },
    {
      ingredient_id: 2,
      name: 'Azúcar',
      current_stock: 2,
      min_stock: 5,
      suggested_qty: 8,
      unit: 'kg',
      estimated_cost: 8000
    }
  ];

  test('renders warning title and summary of items below min stock', () => {
    render(<RestockPanel restockSuggestions={mockSuggestions} onCopy={() => {}} />);
    expect(screen.getByText('Sugerencia de Reabastecimiento')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined(); // "Hay 2 insumo(s) bajo el stock mínimo."
  });

  test('toggles detail panel when clicking Ver Detalle', () => {
    render(<RestockPanel restockSuggestions={mockSuggestions} onCopy={() => {}} />);
    
    // By default, table is not visible
    expect(screen.queryByText('Insumo')).toBeNull();

    const toggleButton = screen.getByText('Ver Detalle');
    fireEvent.click(toggleButton);

    // After clicking, detail table is visible
    expect(screen.getByText('Insumo')).toBeDefined();
    expect(screen.getByText('Harina')).toBeDefined();
    expect(screen.getByText('Azúcar')).toBeDefined();

    // Check estimated budget calculation (15000 + 8000 = 23000)
    // formatCurrency formats it as $23.000 (CLP format)
    expect(screen.getByText(/23\.000/)).toBeDefined();

    // Click again to hide
    fireEvent.click(screen.getByText('Ocultar Detalle'));
    expect(screen.queryByText('Insumo')).toBeNull();
  });

  test('calls onCopy callback when Copiar Lista is clicked', () => {
    const onCopyMock = vi.fn();
    render(<RestockPanel restockSuggestions={mockSuggestions} onCopy={onCopyMock} />);
    
    const copyButton = screen.getByText('Copiar Lista');
    fireEvent.click(copyButton);

    expect(onCopyMock).toHaveBeenCalledTimes(1);
  });
});
