/**
 * Seed Data — Initial sample products and sellers
 * PINs are stored as SHA-256 hashes
 */
import db from '../db';
import { hashPin } from './crypto';

const sampleProducts = [
  // VITRINA (10 productos)
  { name: 'Trozo de Torta Tres Leches', category: 'vitrina', price: 2500, maxShowcaseHours: 48, active: true, photo: null, createdAt: new Date().toISOString() },
  { name: 'Trozo de Torta de Chocolate', category: 'vitrina', price: 2800, maxShowcaseHours: 48, active: true, photo: null, createdAt: new Date().toISOString() },
  { name: 'Trozo de Torta de Frutilla', category: 'vitrina', price: 3000, maxShowcaseHours: 36, active: true, photo: null, createdAt: new Date().toISOString() },
  { name: 'Cupcake Vainilla', category: 'vitrina', price: 1500, maxShowcaseHours: 48, active: true, photo: null, createdAt: new Date().toISOString() },
  { name: 'Cupcake Red Velvet', category: 'vitrina', price: 1800, maxShowcaseHours: 48, active: true, photo: null, createdAt: new Date().toISOString() },
  { name: 'Cupcake Chocolate', category: 'vitrina', price: 1500, maxShowcaseHours: 48, active: true, photo: null, createdAt: new Date().toISOString() },
  { name: 'Brownie', category: 'vitrina', price: 1200, maxShowcaseHours: 72, active: true, photo: null, createdAt: new Date().toISOString() },
  { name: 'Alfajor de Manjar', category: 'vitrina', price: 1000, maxShowcaseHours: 72, active: true, photo: null, createdAt: new Date().toISOString() },
  { name: 'Dona Glaseada', category: 'vitrina', price: 1200, maxShowcaseHours: 24, active: true, photo: null, createdAt: new Date().toISOString() },
  { name: 'Pie de Limón', category: 'vitrina', price: 2200, maxShowcaseHours: 36, active: true, photo: null, createdAt: new Date().toISOString() },
  // SALADOS (5 productos)
  { name: 'Empanada de Pino', category: 'salados', price: 1800, maxShowcaseHours: 8, active: true, photo: null, createdAt: new Date().toISOString() },
  { name: 'Empanada de Queso', category: 'salados', price: 1500, maxShowcaseHours: 8, active: true, photo: null, createdAt: new Date().toISOString() },
  { name: 'Sándwich Ave Palta', category: 'salados', price: 3500, maxShowcaseHours: 6, active: true, photo: null, createdAt: new Date().toISOString() },
  { name: 'Sándwich Jamón Queso', category: 'salados', price: 2800, maxShowcaseHours: 6, active: true, photo: null, createdAt: new Date().toISOString() },
  { name: 'Quiche de Verduras', category: 'salados', price: 2500, maxShowcaseHours: 12, active: true, photo: null, createdAt: new Date().toISOString() },
  // ENCARGO (6 productos)
  { name: 'Torta Personalizada (10 personas)', category: 'encargo', price: 25000, maxShowcaseHours: 0, active: true, photo: null, createdAt: new Date().toISOString() },
  { name: 'Torta Personalizada (20 personas)', category: 'encargo', price: 40000, maxShowcaseHours: 0, active: true, photo: null, createdAt: new Date().toISOString() },
  { name: 'Torta Personalizada (30 personas)', category: 'encargo', price: 55000, maxShowcaseHours: 0, active: true, photo: null, createdAt: new Date().toISOString() },
  { name: 'Cupcakes por Docena', category: 'encargo', price: 15000, maxShowcaseHours: 0, active: true, photo: null, createdAt: new Date().toISOString() },
  { name: 'Torta Temática Infantil', category: 'encargo', price: 35000, maxShowcaseHours: 0, active: true, photo: null, createdAt: new Date().toISOString() },
  { name: 'Mesa Dulce (20 personas)', category: 'encargo', price: 60000, maxShowcaseHours: 0, active: true, photo: null, createdAt: new Date().toISOString() },
];

export async function seedDatabase() {
  // 1. Seed Products
  const productCount = await db.products.count();
  if (productCount === 0) {
    await db.products.bulkAdd(sampleProducts);
    console.log(`✅ ${sampleProducts.length} productos de ejemplo cargados`);
  }

  // 2. Seed Sellers
  const sellerCount = await db.sellers.count();
  if (sellerCount === 0) {
    const hashedPin1 = await hashPin('1234');
    const hashedPin2 = await hashPin('0000');
    
    const sampleSellers = [
      { name: 'Admin', pin: hashedPin1, active: true, role: 'admin' },
      { name: 'Vendedor 1', pin: hashedPin2, active: true, role: 'seller' },
    ];
    await db.sellers.bulkAdd(sampleSellers);
    console.log('✅ Vendedores de ejemplo cargados');
  }

  // 3. Seed Ingredients
  const ingredientCount = await db.ingredients.count();
  if (ingredientCount === 0) {
    const sampleIngredients = [
      { name: 'Harina de Trigo', unit: 'kg', currentStock: 25, minStock: 10, lastPrice: 1200, category: 'reposteria', active: true },
      { name: 'Azúcar Blanca', unit: 'kg', currentStock: 15, minStock: 5, lastPrice: 1100, category: 'reposteria', active: true },
      { name: 'Huevos', unit: 'docena', currentStock: 10, minStock: 4, lastPrice: 3500, category: 'reposteria', active: true },
      { name: 'Mantequilla', unit: 'kg', currentStock: 8, minStock: 3, lastPrice: 6500, category: 'reposteria', active: true },
      { name: 'Leche Entera', unit: 'l', currentStock: 12, minStock: 6, lastPrice: 9500, category: 'lacteos', active: true },
    ];
    await db.ingredients.bulkAdd(sampleIngredients);
    console.log('✅ Insumos de ejemplo cargados');
  }

  // 4. Migration: re-hash plain-text PINs (if any)
  const allSellers = await db.sellers.toArray();
  for (const seller of allSellers) {
    if (seller.pin && seller.pin.length < 64) {
      const hashed = await hashPin(seller.pin);
      await db.sellers.update(seller.id, { pin: hashed });
      console.log(`🔄 PIN migrado para ${seller.name}`);
    }
  }
}

export default seedDatabase;
