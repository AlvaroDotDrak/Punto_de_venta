// tests/VoidAndCash.test.jsx
import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';

const db = new Dexie('TestVoidCashDB');
db.version(1).stores({
  products: '++id, name, price',
  showcaseItems: '++id, productId, status, showcaseType, saleId',
  sales: '++id, total, paymentMethod, status, createdAt',
  cashRegister: '++id, openingAmount, status',
  cashMovements: '++id, registerId, type, amount, paymentMethod, saleId',
});

describe('Anulación de ventas', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('marca la venta como voided con su motivo', async () => {
    const saleId = await db.sales.add({
      total: 5000, paymentMethod: 'tarjeta', status: 'completed',
      createdAt: new Date().toISOString(),
    });

    await db.sales.update(saleId, {
      status: 'voided',
      voidedAt: new Date().toISOString(),
      voidReason: 'Error en cobro al cliente',
    });

    const sale = await db.sales.get(saleId);
    expect(sale.status).toBe('voided');
    expect(sale.voidReason).toBe('Error en cobro al cliente');
  });

  it('revierte los showcaseItems vendidos al estado activo', async () => {
    const productId = await db.products.add({ name: 'Tarta', price: 5000 });
    const saleId = await db.sales.add({
      total: 10000, paymentMethod: 'efectivo', status: 'completed',
      createdAt: new Date().toISOString(),
    });
    await db.showcaseItems.bulkAdd([
      { productId, status: 'sold', showcaseType: 'trozado', saleId },
      { productId, status: 'sold', showcaseType: 'trozado', saleId },
    ]);

    // Lógica de anulación (replicada de HistorialVentas.jsx)
    const soldItems = await db.showcaseItems.where('saleId').equals(saleId).toArray();
    for (const item of soldItems) {
      await db.showcaseItems.update(item.id, { status: 'active', removedAt: null, saleId: null });
    }

    const reverted = await db.showcaseItems.where({ productId, status: 'active' }).count();
    expect(reverted).toBe(2);
  });

  it('crea un movimiento negativo en caja al anular venta en efectivo', async () => {
    const registerId = await db.cashRegister.add({ openingAmount: 10000, status: 'open' });
    const saleId = await db.sales.add({
      total: 3000, paymentMethod: 'efectivo', status: 'completed',
      createdAt: new Date().toISOString(),
    });

    // Lógica: solo crear movimiento si el pago fue en efectivo
    const sale = await db.sales.get(saleId);
    if (sale.paymentMethod === 'efectivo') {
      await db.cashMovements.add({
        registerId, type: 'void',
        amount: -Math.abs(sale.total),
        description: `Anulación Venta #${saleId}`,
        paymentMethod: 'efectivo', saleId,
        createdAt: new Date().toISOString(),
      });
    }

    const movs = await db.cashMovements.where('registerId').equals(registerId).toArray();
    expect(movs.length).toBe(1);
    expect(movs[0].amount).toBe(-3000);
  });

  it('no crea movimiento en caja al anular venta con tarjeta', async () => {
    const registerId = await db.cashRegister.add({ openingAmount: 10000, status: 'open' });
    const saleId = await db.sales.add({
      total: 5000, paymentMethod: 'tarjeta', status: 'completed',
      createdAt: new Date().toISOString(),
    });

    const sale = await db.sales.get(saleId);
    if (sale.paymentMethod === 'efectivo') {
      await db.cashMovements.add({ registerId, type: 'void', amount: -sale.total, saleId });
    }

    const movs = await db.cashMovements.where('registerId').equals(registerId).toArray();
    expect(movs.length).toBe(0);
  });
});

describe('Cálculo de cierre de caja', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('expectedCash = apertura + ventas_efectivo + ingresos - gastos', async () => {
    const registerId = await db.cashRegister.add({ openingAmount: 20000, status: 'open' });
    await db.cashMovements.bulkAdd([
      { registerId, type: 'sale', amount: 5000, paymentMethod: 'efectivo' },
      { registerId, type: 'sale', amount: 8000, paymentMethod: 'tarjeta' },   // no suma a caja
      { registerId, type: 'sale', amount: 3000, paymentMethod: 'efectivo' },
      { registerId, type: 'expense', amount: 2000, paymentMethod: 'efectivo' },
      { registerId, type: 'income', amount: 1000, paymentMethod: 'efectivo' },
    ]);

    const movs = await db.cashMovements.where('registerId').equals(registerId).toArray();
    const reg = await db.cashRegister.get(registerId);

    const salesCash = movs
      .filter(m => m.type === 'sale' && m.paymentMethod === 'efectivo')
      .reduce((s, m) => s + m.amount, 0);
    const totalExpenses = movs
      .filter(m => m.type === 'expense')
      .reduce((s, m) => s + m.amount, 0);
    const totalIncomes = movs
      .filter(m => m.type === 'income')
      .reduce((s, m) => s + m.amount, 0);
    const expectedCash = reg.openingAmount + salesCash + totalIncomes - totalExpenses;

    expect(salesCash).toBe(8000);     // 5000 + 3000
    expect(expectedCash).toBe(27000); // 20000 + 8000 + 1000 - 2000
  });

  it('ventas con tarjeta y transferencia no afectan el efectivo esperado', async () => {
    const registerId = await db.cashRegister.add({ openingAmount: 10000, status: 'open' });
    await db.cashMovements.bulkAdd([
      { registerId, type: 'sale', amount: 15000, paymentMethod: 'tarjeta' },
      { registerId, type: 'sale', amount: 8000, paymentMethod: 'transferencia' },
    ]);

    const movs = await db.cashMovements.where('registerId').equals(registerId).toArray();
    const reg = await db.cashRegister.get(registerId);

    const salesCash = movs
      .filter(m => m.type === 'sale' && m.paymentMethod === 'efectivo')
      .reduce((s, m) => s + m.amount, 0);
    const expectedCash = reg.openingAmount + salesCash;

    expect(salesCash).toBe(0);
    expect(expectedCash).toBe(10000); // Solo el monto de apertura
  });

  it('gastos e ingresos extra afectan el efectivo esperado correctamente', async () => {
    const registerId = await db.cashRegister.add({ openingAmount: 50000, status: 'open' });
    await db.cashMovements.bulkAdd([
      { registerId, type: 'sale', amount: 20000, paymentMethod: 'efectivo' },
      { registerId, type: 'expense', amount: 5000, paymentMethod: 'efectivo' },
      { registerId, type: 'expense', amount: 3000, paymentMethod: 'efectivo' },
      { registerId, type: 'income', amount: 2000, paymentMethod: 'efectivo' },
    ]);

    const movs = await db.cashMovements.where('registerId').equals(registerId).toArray();
    const reg = await db.cashRegister.get(registerId);

    const salesCash = movs.filter(m => m.type === 'sale' && m.paymentMethod === 'efectivo').reduce((s, m) => s + m.amount, 0);
    const totalExpenses = movs.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0);
    const totalIncomes = movs.filter(m => m.type === 'income').reduce((s, m) => s + m.amount, 0);
    const expectedCash = reg.openingAmount + salesCash + totalIncomes - totalExpenses;

    expect(expectedCash).toBe(64000); // 50000 + 20000 + 2000 - 5000 - 3000
  });
});
