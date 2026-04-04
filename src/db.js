/**
 * Database Layer - Dexie.js (IndexedDB wrapper)
 * Punto de Venta - Pastelería
 * 
 * All data persists in the browser's IndexedDB.
 * v2: Added auditLog, orderItems tables; enhanced showcaseItems
 */
import Dexie from 'dexie';

export const db = new Dexie('PasteleriaPoS');

// v1 original schema
db.version(1).stores({
  products: '++id, name, category, price, maxShowcaseHours, active, createdAt',
  showcaseItems: '++id, productId, placedAt, removedAt, status',
  sales: '++id, total, paymentMethod, sellerId, createdAt',
  saleItems: '++id, saleId, productId, productName, price, quantity, subtotal',
  orders: '++id, customerName, phone, description, deliveryDate, advance, balance, status, createdAt, updatedAt',
  cashRegister: '++id, openedAt, closedAt, openingAmount, closingAmount, expectedAmount, status',
  cashMovements: '++id, registerId, type, amount, description, paymentMethod, saleId, createdAt',
  sellers: '++id, name, pin, active',
});

// v2 — security + new features
db.version(2).stores({
  products: '++id, name, category, price, maxShowcaseHours, active, createdAt',
  showcaseItems: '++id, productId, placedAt, removedAt, status, showcaseType, parentId, slicedAt',
  sales: '++id, total, paymentMethod, sellerId, createdAt',
  saleItems: '++id, saleId, productId, productName, price, quantity, subtotal',
  orders: '++id, customerName, phone, description, deliveryDate, advance, balance, status, createdAt, updatedAt',
  orderItems: '++id, orderId, productId, productName, price, quantity, subtotal',
  cashRegister: '++id, openedAt, closedAt, openingAmount, closingAmount, expectedAmount, status',
  cashMovements: '++id, registerId, type, amount, description, paymentMethod, saleId, createdAt',
  sellers: '++id, name, pin, active',
  auditLog: '++id, action, userId, details, createdAt',
});

// v3 — sales history, product descriptions
db.version(3).stores({
  products: '++id, name, category, price, maxShowcaseHours, active, createdAt',
  showcaseItems: '++id, productId, placedAt, removedAt, status, showcaseType, parentId, slicedAt',
  sales: '++id, total, paymentMethod, sellerId, createdAt, status',
  saleItems: '++id, saleId, productId, productName, price, quantity, subtotal',
  orders: '++id, customerName, phone, description, deliveryDate, advance, balance, status, createdAt, updatedAt',
  orderItems: '++id, orderId, productId, productName, price, quantity, subtotal',
  cashRegister: '++id, openedAt, closedAt, openingAmount, closingAmount, expectedAmount, status',
  cashMovements: '++id, registerId, type, amount, description, paymentMethod, saleId, createdAt',
  sellers: '++id, name, pin, active',
  auditLog: '++id, action, userId, details, createdAt',
});

// v4 — add slices per product (trozos variables)
db.version(4).stores({
  products: '++id, name, category, price, maxShowcaseHours, active, createdAt, slices', 
  showcaseItems: '++id, productId, placedAt, removedAt, status, showcaseType, parentId, slicedAt',
  sales: '++id, total, paymentMethod, sellerId, createdAt, status',
  saleItems: '++id, saleId, productId, productName, price, quantity, subtotal',
  orders: '++id, customerName, phone, description, deliveryDate, advance, balance, status, createdAt, updatedAt',
  orderItems: '++id, orderId, productId, productName, price, quantity, subtotal',
  cashRegister: '++id, openedAt, closedAt, openingAmount, closingAmount, expectedAmount, status',
  cashMovements: '++id, registerId, type, amount, description, paymentMethod, saleId, createdAt',
  sellers: '++id, name, pin, active',
  auditLog: '++id, action, userId, details, createdAt',
});

// v5 — add roles for access control
db.version(5).stores({
  products: '++id, name, category, price, maxShowcaseHours, active, createdAt, slices', 
  showcaseItems: '++id, productId, placedAt, removedAt, status, showcaseType, parentId, slicedAt',
  sales: '++id, total, paymentMethod, sellerId, createdAt, status',
  saleItems: '++id, saleId, productId, productName, price, quantity, subtotal',
  orders: '++id, customerName, phone, description, deliveryDate, advance, balance, status, createdAt, updatedAt',
  orderItems: '++id, orderId, productId, productName, price, quantity, subtotal',
  cashRegister: '++id, openedAt, closedAt, openingAmount, closingAmount, expectedAmount, status',
  cashMovements: '++id, registerId, type, amount, description, paymentMethod, saleId, createdAt',
  sellers: '++id, name, pin, active, role', // role: 'admin' | 'seller'
  auditLog: '++id, action, userId, details, createdAt',
});

// v6 — add ingredients and inventory movements
db.version(6).stores({
  products: '++id, name, category, price, maxShowcaseHours, active, createdAt, slices',
  showcaseItems: '++id, productId, placedAt, removedAt, status, showcaseType, parentId, slicedAt',
  sales: '++id, total, paymentMethod, sellerId, createdAt, status',
  saleItems: '++id, saleId, productId, productName, price, quantity, subtotal',
  orders: '++id, customerName, phone, description, deliveryDate, advance, balance, status, createdAt, updatedAt',
  orderItems: '++id, orderId, productId, productName, price, quantity, subtotal',
  cashRegister: '++id, openedAt, closedAt, openingAmount, closingAmount, expectedAmount, status',
  cashMovements: '++id, registerId, type, amount, description, paymentMethod, saleId, createdAt',
  sellers: '++id, name, pin, active, role',
  auditLog: '++id, action, userId, details, createdAt',
  ingredients: '++id, name, unit, currentStock, minStock, lastPrice, category, active',
  ingredientMovements: '++id, ingredientId, type, quantity, cost, sellerId, createdAt', // type: 'purchase' | 'adjustment' | 'usage'
});

// v7 — link sales to orders
db.version(7).stores({
  products: '++id, name, category, price, maxShowcaseHours, active, createdAt, slices',
  showcaseItems: '++id, productId, placedAt, removedAt, status, showcaseType, parentId, slicedAt',
  sales: '++id, total, paymentMethod, sellerId, createdAt, status, orderId',
  saleItems: '++id, saleId, productId, productName, price, quantity, subtotal',
  orders: '++id, customerName, phone, description, deliveryDate, advance, balance, status, createdAt, updatedAt',
  orderItems: '++id, orderId, productId, productName, price, quantity, subtotal',
  cashRegister: '++id, openedAt, closedAt, openingAmount, closingAmount, expectedAmount, status',
  cashMovements: '++id, registerId, type, amount, description, paymentMethod, saleId, createdAt',
  sellers: '++id, name, pin, active, role',
  auditLog: '++id, action, userId, details, createdAt',
  ingredients: '++id, name, unit, currentStock, minStock, lastPrice, category, active',
  ingredientMovements: '++id, ingredientId, type, quantity, cost, sellerId, createdAt',
});

export default db;
