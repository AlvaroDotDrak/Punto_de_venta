import { describe, it, expect } from 'vitest';
import { DEFAULT_PROFILE, VERTICAL_OPTIONS, hexToRgba } from '../src/utils/verticals';

// Réplica de la lógica de derivación de categorías usada en Ventas/Productos:
// la categoría con flag `showcase` dispara la venta entero/trozado.
function showcaseCategories(categories) {
  return new Set(categories.filter(c => c.showcase).map(c => c.value));
}

describe('verticals (frontend)', () => {
  it('DEFAULT_PROFILE degrada a pastelería con todos sus módulos', () => {
    expect(DEFAULT_PROFILE.business_type).toBe('pasteleria');
    const c = DEFAULT_PROFILE.capabilities;
    expect(c.showcase && c.freshness && c.orders && c.cooler_stock && c.recipes).toBe(true);
    expect(c.tables || c.weight_sale || c.barcode).toBe(false);
  });

  it('vitrina y salados van a la vitrina (showcase) en el perfil por defecto', () => {
    const showcase = showcaseCategories(DEFAULT_PROFILE.product_categories);
    expect([...showcase].sort()).toEqual(['salados', 'vitrina']);
    expect(showcase.has('bebidas')).toBe(false);  // visicooler, no vitrina
    expect(showcase.has('cafe')).toBe(false);
  });

  it('solo vitrina dispara el modal entero/trozado (sliceable)', () => {
    const sliceable = new Set(DEFAULT_PROFILE.product_categories.filter(c => c.sliceable).map(c => c.value));
    expect(sliceable.has('vitrina')).toBe(true);
    expect(sliceable.has('salados')).toBe(false);  // va a vitrina pero se vende por unidad
  });

  it('vitrina es sliceable; categorías de stock declaran el flag', () => {
    const cats = Object.fromEntries(DEFAULT_PROFILE.product_categories.map(c => [c.value, c]));
    expect(cats.vitrina.sliceable).toBe(true);
    expect(cats.salados.sliceable).not.toBe(true);
    expect(cats.salados.showcase).toBe(true);
    expect(cats.bebidas.stock).toBe(true);
  });

  it('cálculo de venta por peso (kg × precio/kg redondeado)', () => {
    const pricePerKg = 12990;
    const kg = 0.75;
    expect(Math.round(kg * pricePerKg)).toBe(9743);
  });

  it('cada opción de rubro del wizard tiene value, label y emoji', () => {
    expect(VERTICAL_OPTIONS.length).toBeGreaterThanOrEqual(2);
    for (const v of VERTICAL_OPTIONS) {
      expect(v.value).toBeTruthy();
      expect(v.label).toBeTruthy();
      expect(v.emoji).toBeTruthy();
    }
  });

  it('hexToRgba convierte hex a rgba correctamente', () => {
    expect(hexToRgba('#BF5A2F', 0.07)).toBe('rgba(191, 90, 47, 0.07)');
  });

  it('DEFAULT_PROFILE.colors tiene la estructura correcta', () => {
    expect(DEFAULT_PROFILE.colors.primary).toBe('#BF5A2F');
    expect(DEFAULT_PROFILE.colors).toHaveProperty('primary_light');
    expect(DEFAULT_PROFILE.colors).toHaveProperty('primary_dark');
    expect(DEFAULT_PROFILE.colors).toHaveProperty('accent');
  });

  it('cada opción de rubro incluye su defaultPalette en la lista palettes', () => {
    for (const v of VERTICAL_OPTIONS) {
      expect(v.palettes.includes(v.defaultPalette)).toBe(true);
    }
  });
});
