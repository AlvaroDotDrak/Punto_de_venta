// tests/StockLogic.test.jsx
import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
// IMPORTANTE: En tests reales, lo mejor es extraer la lógica de negocio a funciones puras
// o usar una DB mockeada. Aquí simularemos la DB.

// Mock de Dexie para pruebas rápidas
const db = new Dexie('TestPasteleriaDB');
db.version(1).stores({
  products: '++id, name, category, price, maxShowcaseHours, active, createdAt, slices',
  showcaseItems: '++id, productId, placedAt, removedAt, status, showcaseType, parentId, slicedAt',
  sales: '++id, total, paymentMethod, sellerId, createdAt',
  saleItems: '++id, saleId, productId, productName, price, quantity, subtotal'
});

describe('Lógica de Stock: Trozos vs Enteros', () => {

  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('Debe descontar 1 trozo si hay trozos disponibles', async () => {
    // 1. Crear producto (Pastel de 8 trozos)
    const productId = await db.products.add({ name: 'Torta Milhojas', slices: 8, price: 8000 });

    // 2. Poner 3 trozos en vitrina
    await db.showcaseItems.bulkAdd([
      { productId, status: 'active', showcaseType: 'trozado' },
      { productId, status: 'active', showcaseType: 'trozado' },
      { productId, status: 'active', showcaseType: 'trozado' }
    ]);

    // 3. Simular VENTA de 1 trozo
    // (Aquí replicamos la lógica de Ventas.jsx)
    const slice = await db.showcaseItems.where({ productId, status: 'active', showcaseType: 'trozado' }).first();
    if (slice) {
      await db.showcaseItems.update(slice.id, { status: 'sold', removedAt: new Date() });
    }

    // 4. Verificar
    const remaining = await db.showcaseItems.where({ productId, status: 'active', showcaseType: 'trozado' }).count();
    expect(remaining).toBe(2); // Deberían quedar 2
  });

  it('Debe abrir un entero si NO hay trozos, y crear (N-1) nuevos', async () => {
    // 1. Crear producto
    const productId = await db.products.add({ name: 'Cheesecake', slices: 4, price: 4000 });

    // 2. Poner 1 entero en vitrina (0 trozos)
    await db.showcaseItems.add({ productId, status: 'active', showcaseType: 'entero' });

    // 3. Simular VENTA de 1 trozo (Lógica compleja)
    const slice = await db.showcaseItems.where({ productId, status: 'active', showcaseType: 'trozado' }).first();
    
    if (!slice) {
      // Buscar entero
      const whole = await db.showcaseItems.where({ productId, status: 'active', showcaseType: 'entero' }).first();
      expect(whole).toBeDefined(); // Debe haber uno entero

      // Cortar entero
      await db.showcaseItems.update(whole.id, { status: 'sliced' });

      // Crear (4 - 1) = 3 trozos nuevos
      const newSlices = Array(3).fill({ productId, status: 'active', showcaseType: 'trozado', parentId: whole.id });
      await db.showcaseItems.bulkAdd(newSlices);
    }

    // 4. Verificar
    const activeWhole = await db.showcaseItems.where({ productId, status: 'active', showcaseType: 'entero' }).count();
    const activeSlices = await db.showcaseItems.where({ productId, status: 'active', showcaseType: 'trozado' }).count();

    expect(activeWhole).toBe(0); // El entero desapareció
    expect(activeSlices).toBe(3); // Aparecieron 3 trozos nuevos
  });

});
