/**
 * Espejo liviano de los rubros en el frontend.
 * - VERTICAL_OPTIONS: opciones para el SetupWizard (la fuente de verdad de los
 *   presets vive en backend/verticals.py; aquí solo lo necesario para elegir).
 * - DEFAULT_PROFILE: fallback si /config/profile no responde, para que la app
 *   degrade al comportamiento de pastelería en vez de quedar en blanco.
 */

export const PALETTES = {
  terracota: { label: "Terracota", primary: "#BF5A2F", primary_light: "#D9784E", primary_dark: "#943E18", accent: "#C9923A" },
  chocolate: { label: "Chocolate", primary: "#6B4226", primary_light: "#8A5A38", primary_dark: "#4E2F18", accent: "#C9923A" },
  frambuesa: { label: "Frambuesa", primary: "#B23A5E", primary_light: "#CC5C7E", primary_dark: "#8A2545", accent: "#E0A050" },
  miel: { label: "Miel", primary: "#C8820A", primary_light: "#E0A030", primary_dark: "#9A6200", accent: "#BF5A2F" },
  durazno: { label: "Durazno", primary: "#E08A4C", primary_light: "#F0A56E", primary_dark: "#B5612E", accent: "#C2607A" },
  vino: { label: "Vino Tinto", primary: "#7B2D26", primary_light: "#9A463E", primary_dark: "#581913", accent: "#C9923A" },
  verde_botella: { label: "Verde Botella", primary: "#1F5E3A", primary_light: "#357A52", primary_dark: "#123F26", accent: "#C9A227" },
  ambar: { label: "Ámbar", primary: "#B5791F", primary_light: "#D49A3E", primary_dark: "#875812", accent: "#6B4A2A" },
  azul_noche: { label: "Azul Noche", primary: "#2A3D66", primary_light: "#44588A", primary_dark: "#1A2848", accent: "#C9923A" },
  marino: { label: "Azul Marino", primary: "#1F6F8B", primary_light: "#3A8AA6", primary_dark: "#134E63", accent: "#E08A3C" },
  turquesa: { label: "Turquesa", primary: "#138086", primary_light: "#2BA0A6", primary_dark: "#0A5E63", accent: "#F2A65A" },
  coral: { label: "Coral", primary: "#E0613F", primary_light: "#F0815F", primary_dark: "#B5462A", accent: "#2E8B8B" },
  verde_hoja: { label: "Verde Hoja", primary: "#3E7C3A", primary_light: "#5A9A54", primary_dark: "#2A5C28", accent: "#D98A2B" },
  tomate: { label: "Tomate", primary: "#C0392B", primary_light: "#D85547", primary_dark: "#93271B", accent: "#3E7C3A" },
  berenjena: { label: "Berenjena", primary: "#6A3D6E", primary_light: "#875990", primary_dark: "#4E2A52", accent: "#9AB54A" },
  azul_retail: { label: "Azul", primary: "#2C5F8A", primary_light: "#4880AB", primary_dark: "#1C4366", accent: "#E08A3C" },
  rojo_retail: { label: "Rojo", primary: "#C42B33", primary_light: "#DC4A52", primary_dark: "#961D24", accent: "#2C5F8A" },
  gris_azulado: { label: "Gris Azulado", primary: "#455A6B", primary_light: "#5E7787", primary_dark: "#2F3E4A", accent: "#E0A030" },
  marron_calido: { label: "Marrón Cálido", primary: "#8A5A2C", primary_light: "#A6764A", primary_dark: "#66401C", accent: "#C9923A" },
  oliva: { label: "Oliva", primary: "#6B7A2C", primary_light: "#8A9A45", primary_dark: "#4E5C1C", accent: "#C0392B" },
  burdeos: { label: "Burdeos", primary: "#7A2230", primary_light: "#9A3848", primary_dark: "#581620", accent: "#C9923A" },
};

export function hexToRgba(hex, alpha) {
  const h = (hex || '#000000').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function hexToRgbTriplet(hex) {
  const h = (hex || '#000000').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

// Tono muy oscuro del primario (para fondos tipo sidebar). factor ~0.15 mantiene
// el matiz del rubro pero suficientemente oscuro para texto claro legible.
export function darkenHex(hex, factor) {
  const h = (hex || '#000000').replace('#', '');
  const to2 = (n) => Math.round(n).toString(16).padStart(2, '0');
  const r = parseInt(h.slice(0, 2), 16) * factor;
  const g = parseInt(h.slice(2, 4), 16) * factor;
  const b = parseInt(h.slice(4, 6), 16) * factor;
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

export const VERTICAL_OPTIONS = [
  { value: 'pasteleria', label: 'Pastelería', emoji: '🧁', description: 'Vitrina por trozos, frescura y encargos', palettes: ['terracota', 'chocolate', 'frambuesa', 'miel', 'durazno'], defaultPalette: 'terracota' },
  { value: 'botilleria', label: 'Botillería', emoji: '🍷', description: 'Licores y bebidas con control de stock', palettes: ['vino', 'verde_botella', 'ambar', 'azul_noche'], defaultPalette: 'vino' },
  { value: 'cevicheria', label: 'Cevichería', emoji: '🦐', description: 'Mariscos con mesas y control de frescura', palettes: ['marino', 'turquesa', 'coral'], defaultPalette: 'marino' },
  { value: 'verduleria', label: 'Verdulería', emoji: '🥬', description: 'Frutas y verduras', palettes: ['verde_hoja', 'tomate', 'berenjena'], defaultPalette: 'verde_hoja' },
  { value: 'minimarket', label: 'Minimarket', emoji: '🏪', description: 'Almacén con código de barras', palettes: ['azul_retail', 'rojo_retail', 'gris_azulado'], defaultPalette: 'azul_retail' },
  { value: 'restaurant', label: 'Restaurant', emoji: '🍽️', description: 'Cocina y comedor con mesas', palettes: ['marron_calido', 'oliva', 'burdeos', 'vino'], defaultPalette: 'marron_calido' },
];

export const DEFAULT_PROFILE = {
  business_type: 'pasteleria',
  palette: 'terracota',
  colors: { primary: '#BF5A2F', primary_light: '#D9784E', primary_dark: '#943E18', accent: '#C9923A' },
  available_palettes: [],
  capabilities: {
    showcase: true,
    freshness: true,
    orders: true,
    cooler_stock: true,
    recipes: true,
    tables: false,
    weight_sale: false,
    barcode: false,
    age_restriction: false,
  },
  branding: {
    name: 'Punto de Venta',
    tagline: 'PASTELERÍA ARTESANAL',
    emoji: '🧁',
    primary_color: '#BF5A2F',
  },
  product_categories: [
    { value: 'vitrina', label: 'Vitrina', emoji: '🍰', showcase: true, sliceable: true },
    { value: 'salados', label: 'Salados', emoji: '🥪', showcase: true, sliceable: false },
    { value: 'encargo', label: 'Encargo', emoji: '🎂', showcase: false },
    { value: 'bebidas', label: 'Bebidas', emoji: '🥤', showcase: false, stock: true },
    { value: 'cafe', label: 'Café', emoji: '☕', showcase: false },
    { value: 'mostrador', label: 'Mostrador', emoji: '🍪', showcase: false, stock: true },
  ],
  terminology: {},
  tax_rate: 0.19,
  setup_complete: true,
  printing: { auto_print: false, printer_name: 'POS-80', print_logo: false },
};
