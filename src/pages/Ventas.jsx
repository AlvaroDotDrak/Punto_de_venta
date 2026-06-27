/**
 * Ventas (POS) — Pastelería Tía Julia
 * V4.0: Premium Artisan Edition
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useSeller } from '../context/SellerContext';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import { formatCurrency } from '../utils/formatters';
import { Search, MapPin, Trash2, ShoppingBag } from 'lucide-react';
import TypeModal from '../components/Ventas/TypeModal';
import PaymentModal from '../components/Ventas/PaymentModal';
import ReceiptModal from '../components/Ventas/ReceiptModal';

export default function Ventas() {
  const { currentSeller } = useSeller();
  const { categories, t, hasCapability, branding, printing } = useConfig();
  const toast = useToast();

  // Categorías derivadas de la configuración del rubro
  const catTabs = useMemo(
    () => [{ value: 'todos', label: 'Todos', emoji: null }, ...categories.map(c => ({ value: c.value, label: c.label, emoji: c.emoji }))],
    [categories]
  );
  const showcaseCats = useMemo(
    () => new Set(categories.filter(c => c.showcase).map(c => c.value)),
    [categories]
  );
  const sliceableCats = useMemo(
    () => new Set(categories.filter(c => c.sliceable).map(c => c.value)),
    [categories]
  );
  const ageRestrictedCats = useMemo(
    () => new Set(categories.filter(c => c.age_restricted).map(c => c.value)),
    [categories]
  );
  const categoryEmoji = useMemo(
    () => Object.fromEntries(categories.map(c => [c.value, c.emoji])),
    [categories]
  );

  const [products, setProducts] = useState([]);
  const [showcaseItems, setShowcaseItems] = useState([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('todos');
  const [onlyInShowcase, setOnlyInShowcase] = useState(false);
  const [cart, setCart] = useState([]);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [cashReceived, setCashReceived] = useState('');
  const [hasReceipt, setHasReceipt] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(null);
  const [weightProduct, setWeightProduct] = useState(null);
  const [ageConfirmProduct, setAgeConfirmProduct] = useState(null);
  const [sortOrder, setSortOrder] = useState('alpha'); // 'alpha' | 'price' | 'popular'

  // Escaneo global de código de barras: el lector "teclea" muy rápido y termina
  // en Enter. Detectamos esa ráfaga aunque el foco no esté en la barra de búsqueda.
  const scanBufferRef = useRef('');
  const scanTimeRef = useRef(0);
  const scanHandlerRef = useRef(null);
  const scanBlockedRef = useRef(false);

  const loadData = async () => {
    try {
      const [prods, showcase] = await Promise.all([
        api.get('/products'),
        api.get('/showcase?status=active'),
      ]);
      setProducts(prods);
      setShowcaseItems(showcase);
    } catch (err) {
      toast.error('Error al cargar datos: ' + err.message);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Listener global del lector de barras (solo si el rubro lo soporta).
  useEffect(() => {
    if (!hasCapability('barcode')) return;
    const SCAN_GAP_MS = 50; // umbral entre teclas: un humano es más lento
    const handler = (e) => {
      const el = e.target;
      const tag = (el?.tagName || '').toLowerCase();
      const isField = tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable;
      // No interferir si se escribe en un campo o si hay un modal abierto
      if (isField || scanBlockedRef.current) return;

      const now = Date.now();
      if (now - scanTimeRef.current > SCAN_GAP_MS) scanBufferRef.current = '';
      scanTimeRef.current = now;

      if (e.key === 'Enter') {
        const code = scanBufferRef.current.trim();
        scanBufferRef.current = '';
        if (code.length >= 3) {
          e.preventDefault();
          scanHandlerRef.current?.(code);
        }
        return;
      }
      if (e.key.length === 1) scanBufferRef.current += e.key;
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hasCapability]);

  // stockMap: productId → { enteros, trozos, total }
  const stockMap = useMemo(() => {
    const map = {};
    showcaseItems.forEach(item => {
      const pid = item.product_id;
      if (!map[pid]) map[pid] = { enteros: 0, trozos: 0, total: 0 };
      if (item.showcase_type === 'trozado') map[pid].trozos++;
      else map[pid].enteros++;
      map[pid].total++;
    });
    return map;
  }, [showcaseItems]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (activeCategory !== 'todos') list = list.filter(p => p.category === activeCategory);
    if (search) list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    if (onlyInShowcase) list = list.filter(p => stockMap[p.id]?.total > 0);

    // Ordenamiento
    list = [...list]; // copia para no mutar
    if (sortOrder === 'price') list.sort((a, b) => a.price - b.price);
    else if (sortOrder === 'popular') list.sort((a, b) => (b.units_sold ?? 0) - (a.units_sold ?? 0));
    // 'alpha' ya viene ordenado de la API

    return list;
  }, [products, activeCategory, search, onlyInShowcase, stockMap, sortOrder]);

  const addToCart = (product, overridePrice, overrideName, showcaseType = null, weight = null) => {
    const price = overridePrice ?? product.price;
    const name = overrideName ?? product.name;
    setCart(prev => {
      const key = `${product.id}-${name}`;
      const existing = prev.find(i => `${i.product_id}-${i.product_name}` === key);
      if (existing) {
        return prev.map(i =>
          `${i.product_id}-${i.product_name}` === key
            ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.price }
            : i
        );
      }
      return [...prev, {
        product_id: product.id,
        product_name: name,
        price,
        quantity: 1,
        subtotal: price,
        category: product.category,
        photo: product.photo || null,
        showcase_type: showcaseType,
        weight,
      }];
    });
  };

  const proceedAddProduct = (product) => {
    // Producto vendido por peso → pedir los kg
    if (product.sold_by === 'weight') {
      setWeightProduct(product);
      return;
    }

    // Si la categoría es trozable (sliceable), siempre permitir elegir entero o
    // por trozo, incluso sin stock registrado (Vitrina Automática). Las categorías
    // de vitrina NO trozables (ej. ceviches en tupper) caen al flujo de stock normal.
    if (sliceableCats.has(product.category)) {
      const stock = stockMap[product.id] || { enteros: 0, trozos: 0, total: 0 };
      setShowTypeModal({ product, stock });
      return;
    }

    // Lógica para el resto de productos (salados, bebidas, café, etc.)
    const stock = stockMap[product.id];
    if (!stock || stock.total === 0) { addToCart(product); return; }
    if (stock.enteros > 0 && stock.trozos > 0) {
      setShowTypeModal({ product, stock });
      return;
    }
    if (stock.trozos > 0 && stock.enteros === 0) {
      const slicePrice = product.slice_price ?? Math.round(product.price / (product.slices || 8));
      addToCart(product, slicePrice, `${product.name} (Trozo)`, 'trozado');
      return;
    }
    addToCart(product, null, null, 'entero');
  };

  const handleProductClick = (product) => {
    if (hasCapability('age_restriction') && ageRestrictedCats.has(product.category)) {
      setAgeConfirmProduct(product);
      return;
    }
    proceedAddProduct(product);
  };

  // Mantener actualizados los refs que usa el listener global de escaneo
  scanBlockedRef.current = !!(showPayment || showReceipt || showTypeModal || weightProduct || ageConfirmProduct);
  scanHandlerRef.current = (code) => {
    const match = products.find(p => p.barcode && p.barcode === code);
    if (match) handleProductClick(match);
    else toast.error(`Código no encontrado: ${code}`);
  };

  const updateQuantity = (product_id, product_name, delta) => {
    setCart(prev => prev.map(i => {
      if (i.product_id !== product_id || i.product_name !== product_name) return i;
      const qty = Math.max(0, i.quantity + delta);
      if (qty === 0) return null;
      return { ...i, quantity: qty, subtotal: qty * i.price };
    }).filter(Boolean));
  };

  const removeFromCart = (product_id, product_name) =>
    setCart(prev => prev.filter(i => !(i.product_id === product_id && i.product_name === product_name)));

  const cartTotal = cart.reduce((s, i) => s + i.subtotal, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const change = paymentMethod === 'efectivo' ? Math.max(0, (parseInt(cashReceived) || 0) - cartTotal) : 0;

  const completeSale = async () => {
    if (cart.length === 0 || processingPayment) return;
    setProcessingPayment(true);
    try {
      const sale = await api.post('/sales', {
        total: cartTotal,
        payment_method: paymentMethod,
        has_receipt: paymentMethod === 'tarjeta' ? true : hasReceipt,
        items: cart.map(i => ({
          product_id: i.product_id,
          product_name: i.product_name,
          price: i.price,
          quantity: i.quantity,
          subtotal: i.subtotal,
          showcase_type: i.showcase_type,
          weight: i.weight ?? null,
        })),
      });

      setLastSale({
        id: sale.id,
        items: cart,
        total: cartTotal,
        paymentMethod,
        cashReceived: paymentMethod === 'efectivo' ? parseInt(cashReceived) || 0 : 0,
        change,
        seller: currentSeller?.name,
        date: sale.created_at,
        hasReceipt: paymentMethod === 'tarjeta' ? true : hasReceipt,
      });

      setCart([]);
      setShowPayment(false);
      setCashReceived('');
      setPaymentMethod('efectivo');
      setHasReceipt(false);
      setShowReceipt(true);
      toast.success(`Venta #${sale.id} completada — ${formatCurrency(cartTotal)}`);

      // Impresión automática de la boleta (si está activada en Configuración)
      if (printing?.auto_print) {
        api.post('/print/receipt', {
          sale_id: sale.id,
          cash_received: paymentMethod === 'efectivo' ? (parseInt(cashReceived) || 0) : null,
        }).catch(err => toast.error('No se pudo imprimir la boleta: ' + err.message));
      }

      loadData(); // refrescar stock
    } catch (err) {
      toast.error('Error al registrar la venta: ' + err.message);
    } finally {
      setProcessingPayment(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="pos-layout" style={{ height: 'auto', minHeight: 'calc(100vh - 120px)' }}>
        {/* LEFT: Products */}
        <div className="pos-products">
          <div className="pos-header-actions card glass noise-overlay" style={{ padding: 'var(--space-md)', marginBottom: 'var(--space-md)', border: 'none' }}>
            <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="search-bar" style={{ flex: 1, minWidth: 260 }}>
                <Search className="search-icon" size={18} />
                <input type="text" placeholder={hasCapability('barcode') ? "Buscar o escanea código..." : "Buscar producto..."}
                  value={search} onChange={e => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    const code = search.trim();
                    if (!code) return;
                    if (hasCapability('barcode')) {
                      const match = products.find(p => p.barcode && p.barcode === code);
                      if (match) {
                        handleProductClick(match);
                        setSearch('');
                        e.preventDefault();
                        return;
                      }
                    }
                    // Fallback: si el filtro deja exactamente 1 producto, agregarlo
                    if (filteredProducts.length === 1) {
                      handleProductClick(filteredProducts[0]);
                      setSearch('');
                    }
                  }}
                />
              </div>
              <label className="filter-toggle" style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: onlyInShowcase ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                transition: 'color var(--transition-fast)'
              }}>
                <input type="checkbox" checked={onlyInShowcase}
                  onChange={e => setOnlyInShowcase(e.target.checked)} 
                  style={{ cursor: 'pointer', width: 18, height: 18 }}
                />
                <MapPin size={16} />
                <span>Solo en {t('showcase', 'vitrina').toLowerCase()}</span>
              </label>
            </div>

            <div className="tabs" style={{ marginTop: 'var(--space-md)', marginBottom: 0, borderBottom: 'none' }}>
              {catTabs.map(({ value, label, emoji }) => (
                <button key={value} className={`tab ${activeCategory === value ? 'active' : ''}`}
                  onClick={() => setActiveCategory(value)}
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.8px',
                    padding: '10px 16px'
                  }}>
                  {emoji && <span style={{ marginRight: 6 }}>{emoji}</span>} {label}
                </button>
              ))}
            </div>

            {/* Selector de orden */}
            <div style={{ display: 'flex', gap: 6, marginTop: 'var(--space-sm)' }}>
              {[
                { key: 'alpha',   label: 'A–Z' },
                { key: 'price',   label: 'Precio' },
                { key: 'popular', label: '⭐ Más vendidos' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSortOrder(key)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 'var(--radius-full)',
                    border: `1.5px solid ${sortOrder === key ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: sortOrder === key ? 'var(--color-primary-bg)' : 'transparent',
                    color: sortOrder === key ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="pos-products-grid" style={{ padding: 4, gap: 'var(--space-md)' }}>
            {filteredProducts.length === 0 ? (
              <div className="empty-state" style={{ gridColumn: '1 / -1', minHeight: '40vh' }}>
                <Search size={48} strokeWidth={1.2} style={{ opacity: 0.2, marginBottom: 'var(--space-md)' }} />
                <h3 className="text-display" style={{ fontSize: '1.5rem', marginBottom: 8, color: 'var(--color-text-secondary)' }}>Sin resultados</h3>
                <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem' }}>
                  {onlyInShowcase ? 'No hay productos en vitrina actualmente' : 'Intenta con otros términos de búsqueda'}
                </p>
              </div>
            ) : filteredProducts.map((product, idx) => {
              const showcaseStock = stockMap[product.id];
              const hasShowcaseStock = showcaseStock && showcaseStock.total > 0;
              const physicalStock = product.stock;
              const outOfPhysicalStock = physicalStock !== null && physicalStock !== undefined && physicalStock <= 0;
              const isDisabled = (onlyInShowcase && !hasShowcaseStock) || outOfPhysicalStock;
              
              // Animación escalonada para los primeros items
              const staggerClass = idx < 10 ? `stagger-${(idx % 5) + 1}` : 'animate-slide-up';
              
              return (
                <button key={product.id}
                  className={`pos-product-btn ${isDisabled ? 'out-of-stock' : ''} ${product.photo ? 'has-photo' : ''} ${staggerClass}`}
                  onClick={() => handleProductClick(product)}
                  disabled={isDisabled}
                  style={{
                    height: 'auto',
                    minHeight: 180,
                    padding: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-card)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-sm)',
                    transition: 'all var(--transition-bounce)'
                  }}>
                  <div style={{ position: 'relative', height: 110, background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {product.photo ? (
                      <img src={product.photo} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: '2.8rem', opacity: 0.8 }}>{categoryEmoji[product.category] || branding?.emoji || '🛒'}</span>
                    )}
                    
                    {showcaseStock && showcaseStock.total > 0 && (
                      <div style={{ 
                        position: 'absolute', 
                        top: 8, 
                        right: 8, 
                        background: 'var(--color-success)', 
                        color: '#fff', 
                        fontSize: '0.6rem', 
                        fontWeight: 900, 
                        padding: '3px 8px', 
                        borderRadius: 'var(--radius-full)',
                        boxShadow: '0 2px 8px rgba(46, 139, 87, 0.4)',
                        letterSpacing: '0.5px'
                      }}>
                        EN VITRINA
                      </div>
                    )}
                  </div>
                  
                  <div style={{ padding: '12px', textAlign: 'left', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div className="pos-product-name" style={{ fontSize: '0.875rem', marginBottom: 4, fontWeight: 700, height: '2.6em', overflow: 'hidden', color: 'var(--color-text)' }}>
                      {product.name}
                    </div>
                    
                    <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div className="pos-product-price text-display" style={{ fontSize: '1rem', color: 'var(--color-primary)', fontWeight: 800 }}>
                        {formatCurrency(product.price)}
                      </div>
                      
                      {physicalStock !== null && physicalStock !== undefined && (
                        <div style={{ 
                          fontSize: '0.65rem', 
                          fontWeight: 700, 
                          color: physicalStock > 0 ? 'var(--color-success)' : 'var(--color-danger)',
                          background: physicalStock > 0 ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                          padding: '2px 6px',
                          borderRadius: 'var(--radius-sm)'
                        }}>
                          {physicalStock > 0 ? `${physicalStock} ud` : 'Sin stock'}
                        </div>
                      )}
                    </div>

                    {showcaseStock && showcaseStock.total > 0 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-success)', marginTop: 6, fontWeight: 800, opacity: 0.9, display: 'flex', gap: '6px' }}>
                        {showcaseStock.enteros > 0 && <span>🎂 {showcaseStock.enteros}</span>}
                        {showcaseStock.trozos > 0 && <span>🍰 {showcaseStock.trozos}</span>}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Cart */}
        <div className="pos-cart glass noise-overlay" style={{ border: 'none', boxShadow: 'var(--shadow-xl)', borderRadius: 'var(--radius-xl)', height: 'calc(100vh - 140px)', position: 'sticky', top: 80 }}>
          <div className="pos-cart-header" style={{ background: 'transparent', padding: 'var(--space-lg)' }}>
            <h3 className="text-display" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 12, fontSize: '1.4rem' }}>
              <ShoppingBag size={24} className="icon" style={{ color: 'var(--color-primary)' }} />
              Carrito
              {cartCount > 0 && (
                <span className="animate-scale-in" style={{
                  background: 'var(--color-primary)',
                  color: '#fff',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  minWidth: 24,
                  height: 24,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 6px',
                  boxShadow: '0 4px 12px rgba(var(--color-primary-rgb), 0.4)'
                }}>{cartCount}</span>
              )}
            </h3>
            {cart.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setCart([])} style={{ color: 'var(--color-danger)' }}>
                <Trash2 size={16} />
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="pos-cart-empty" style={{ opacity: 0.9 }}>
              <div style={{ 
                width: 90, 
                height: 90, 
                borderRadius: '50%', 
                background: 'var(--color-bg)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontSize: '2.5rem',
                marginBottom: 'var(--space-lg)',
                boxShadow: 'var(--shadow-inset)'
              }}>{branding?.emoji || '🛒'}</div>
              <p className="text-display" style={{ fontSize: '1.2rem', color: 'var(--color-text)', marginBottom: 8 }}>Tu pedido está vacío</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', maxWidth: '220px', lineHeight: 1.5 }}>Selecciona productos de la izquierda para comenzar la venta.</p>
            </div>
          ) : (
            <div className="pos-cart-items" style={{ padding: '0 var(--space-md)' }}>
              {cart.map(item => (
                <div key={`${item.product_id}-${item.product_name}`} className="pos-cart-item animate-slide-up" style={{
                  background: '#fff',
                  margin: '0 0 6px 0',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  padding: '7px 10px',
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  <div className="pos-cart-item-info">
                    <div className="pos-cart-item-name" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)' }}>{item.product_name}</div>
                    <div className="pos-cart-item-price" style={{ fontSize: '0.75rem', opacity: 0.6 }}>{formatCurrency(item.price)} c/u</div>
                  </div>
                  <div className="pos-cart-qty" style={{ border: 'none', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: 2 }}>
                    <button onClick={() => updateQuantity(item.product_id, item.product_name, -1)} style={{ width: 26, height: 26 }}>−</button>
                    <span style={{ fontSize: '0.85rem', minWidth: 24 }}>{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.product_id, item.product_name, 1)} style={{ width: 26, height: 26 }}>+</button>
                  </div>
                  <div className="pos-cart-item-subtotal text-display" style={{ minWidth: 'auto', fontSize: '0.88rem', fontWeight: 800, color: 'var(--color-primary)' }}>
                    {formatCurrency(item.subtotal)}
                  </div>
                  <button className="pos-cart-remove" onClick={() => removeFromCart(item.product_id, item.product_name)} style={{ padding: 4 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="pos-cart-footer" style={{ background: 'transparent', padding: 'var(--space-xl)', borderTop: '1px solid var(--color-border)' }}>
            <div className="pos-cart-total" style={{ border: 'none', marginBottom: 'var(--space-lg)' }}>
              <span className="text-display" style={{ fontSize: '1.1rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Total a Pagar</span>
              <span className="amount text-display" style={{ fontSize: '2.2rem', fontWeight: 900 }}>{formatCurrency(cartTotal)}</span>
            </div>
            <button className="btn btn-primary pos-pay-btn"
              disabled={cart.length === 0}
              onClick={() => setShowPayment(true)}
              style={{
                height: 64,
                fontSize: '1.2rem',
                borderRadius: 'var(--radius-lg)',
                boxShadow: '0 12px 32px rgba(var(--color-primary-rgb), 0.4)',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
              Confirmar Venta
            </button>
          </div>
        </div>
      </div>

      {showTypeModal && (
        <TypeModal
          product={showTypeModal.product}
          stock={showTypeModal.stock}
          onSelect={(type) => {
            const p = showTypeModal.product;
            if (type === 'trozo') {
              const slicePrice = p.slice_price ?? Math.round(p.price / (p.slices || 8));
              addToCart(p, slicePrice, `${p.name} (Trozo)`, 'trozado');
            } else {
              addToCart(p, null, null, 'entero');
            }
            setShowTypeModal(null);
          }}
          onClose={() => setShowTypeModal(null)}
        />
      )}

      {weightProduct && (
        <WeightModal
          product={weightProduct}
          onConfirm={(kg) => {
            const portion = Math.round(kg * weightProduct.price);
            addToCart(weightProduct, portion, `${weightProduct.name} (${kg} kg)`, null, kg);
            setWeightProduct(null);
          }}
          onClose={() => setWeightProduct(null)}
        />
      )}

      {ageConfirmProduct && (
        <div className="modal-overlay" onClick={() => setAgeConfirmProduct(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>⚠️ Venta con restricción de edad</h3></div>
            <div className="modal-body">
              <p><strong>{ageConfirmProduct.name}</strong> es un producto con venta
              restringida a mayores de 18 años.</p>
              <p style={{ marginTop: 'var(--space-sm)' }}>¿El cliente es mayor de edad?</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setAgeConfirmProduct(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={() => {
                proceedAddProduct(ageConfirmProduct);
                setAgeConfirmProduct(null);
              }}>
                Sí, es mayor de 18
              </button>
            </div>
          </div>
        </div>
      )}

      {showPayment && (
        <PaymentModal
          total={cartTotal}
          paymentMethod={paymentMethod}
          cashReceived={cashReceived}
          change={change}
          hasReceipt={hasReceipt}
          processing={processingPayment}
          onMethodChange={setPaymentMethod}
          onCashChange={setCashReceived}
          onReceiptChange={setHasReceipt}
          onConfirm={completeSale}
          onClose={() => setShowPayment(false)}
        />
      )}

      {showReceipt && lastSale && (
        <ReceiptModal
          sale={lastSale}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </div>
  );
}

function WeightModal({ product, onConfirm, onClose }) {
  const [kg, setKg] = useState('');
  const value = parseFloat(kg);
  const valid = Number.isFinite(value) && value > 0;
  const subtotal = valid ? Math.round(value * product.price) : 0;

  const submit = (e) => {
    e?.preventDefault();
    if (valid) onConfirm(value);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: '1.05rem' }}>⚖️ {product.name}</h2>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              {formatCurrency(product.price)} por kg
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Peso (kg)</label>
              <input
                className="form-input"
                type="number" min="0" step="0.01" inputMode="decimal"
                placeholder="Ej: 0.75"
                value={kg}
                autoFocus
                onChange={e => setKg(e.target.value)}
                style={{ fontSize: '1.4rem', fontWeight: 700, textAlign: 'center' }}
              />
            </div>
            <div style={{ textAlign: 'center', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-primary)' }}>
              {valid ? `${value} kg × ${formatCurrency(product.price)} = ${formatCurrency(subtotal)}` : 'Ingresa el peso'}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={!valid} style={{ flex: 1 }}>
              Agregar {valid ? formatCurrency(subtotal) : ''}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
