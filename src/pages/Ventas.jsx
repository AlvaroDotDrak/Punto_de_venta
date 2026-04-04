/**
 * Ventas (POS) — Punto de venta principal
 * V2.1: showcase filter, stock indicators, type selection modal, info tooltip
 *
 * Flujo: seleccionar → cantidad → pago → finalizar (máximo 4 clics)
 * Features: product photos, loading spinner, audit logging, showcase filter
 */
import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useSeller } from '../context/SellerContext';
import { useToast } from '../context/ToastContext';
import { formatCurrency } from '../utils/formatters';
import { logAction, ACTIONS } from '../utils/auditLog';
import ProductInfoTooltip from '../components/ProductInfoTooltip';
import { Search, ShoppingCart, Trash2, Plus, Minus, X, CreditCard, MapPin, Package, Scissors } from 'lucide-react';
import TypeModal from '../components/Ventas/TypeModal';
import PaymentModal from '../components/Ventas/PaymentModal';
import ReceiptModal from '../components/Ventas/ReceiptModal';

// Category emoji mapping
const categoryEmoji = {
  vitrina: '🍰',
  salados: '🥪',
  encargo: '🎂',
};

const categoryLabel = {
  todos: 'Todos',
  vitrina: 'Vitrina',
  salados: 'Salados',
  encargo: 'Encargo',
};

export default function Ventas() {
  const { currentSeller } = useSeller();
  const toast = useToast();
  
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('todos');
  const [onlyInShowcase, setOnlyInShowcase] = useState(false);
  const [cart, setCart] = useState([]);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [cashReceived, setCashReceived] = useState('');
  const [lastSale, setLastSale] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(null); // { product, stock }

  // Load active products
  const products = useLiveQuery(() => 
    db.products.filter(p => p.active !== false).toArray()
  , [], []);

  // Load showcase items for stock display
  const showcaseItems = useLiveQuery(() =>
    db.showcaseItems.where('status').equals('active').toArray()
  , [], []);

  // Compute stock map: productId -> { enteros, trozos, total, slicePrice }
  const stockMap = useMemo(() => {
    const map = {};
    showcaseItems.forEach(item => {
      const pid = item.productId;
      if (!map[pid]) map[pid] = { enteros: 0, trozos: 0, total: 0, slicePrice: 0 };
      if (item.showcaseType === 'trozado') {
        map[pid].trozos++;
        if (item.slicePrice) map[pid].slicePrice = item.slicePrice;
      } else {
        map[pid].enteros++;
      }
      map[pid].total++;
    });
    return map;
  }, [showcaseItems]);

  // Filter products
  const filteredProducts = useMemo(() => {
    let filtered = products;
    if (activeCategory !== 'todos') {
      filtered = filtered.filter(p => p.category === activeCategory);
    }
    if (search) {
      const term = search.toLowerCase();
      filtered = filtered.filter(p => p.name.toLowerCase().includes(term));
    }
    if (onlyInShowcase) {
      filtered = filtered.filter(p => stockMap[p.id] && stockMap[p.id].total > 0);
    }
    return filtered;
  }, [products, activeCategory, search, onlyInShowcase, stockMap]);

  // Cart operations
  const addToCart = (product, overridePrice, overrideName) => {
    const price = overridePrice || product.price;
    const name = overrideName || product.name;

    setCart(prev => {
      // Use a composite key: productId + name (to differentiate entero vs trozo)
      const existing = prev.find(item => item.productId === product.id && item.productName === name);
      if (existing) {
        return prev.map(item =>
          item.productId === product.id && item.productName === name
            ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.price }
            : item
        );
      }
      return [...prev, {
        productId: product.id,
        productName: name,
        price: price,
        quantity: 1,
        subtotal: price,
        category: product.category,
        photo: product.photo || null,
      }];
    });
  };

  // Handle adding product — check if type selection needed
  const handleProductClick = (product) => {
    const stock = stockMap[product.id];
    
    // If showcase filter is OFF and product has no stock, just add normally
    if (!stock || stock.total === 0) {
      addToCart(product);
      return;
    }

    // If product has both enteros and trozos, show type selection
    if (stock.enteros > 0 && stock.trozos > 0) {
      setShowTypeModal({ product, stock });
      return;
    }

    // If only trozos available
    if (stock.trozos > 0 && stock.enteros === 0 && stock.slicePrice > 0) {
      addToCart(product, stock.slicePrice, `${product.name} (Trozo)`);
      return;
    }

    // Default: add as entero
    addToCart(product);
  };

  const updateQuantity = (productId, productName, delta) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.productId !== productId || item.productName !== productName) return item;
        const newQty = Math.max(0, item.quantity + delta);
        if (newQty === 0) return null;
        return { ...item, quantity: newQty, subtotal: newQty * item.price };
      }).filter(Boolean);
    });
  };

  const removeFromCart = (productId, productName) => {
    setCart(prev => prev.filter(item => !(item.productId === productId && item.productName === productName)));
  };

  const clearCart = () => setCart([]);

  const cartTotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const change = paymentMethod === 'efectivo' ? Math.max(0, (parseInt(cashReceived) || 0) - cartTotal) : 0;

  // Finalize sale (with loading state)
  const completeSale = async () => {
    if (cart.length === 0 || processingPayment) return;
    
    setProcessingPayment(true);
    try {
      const now = new Date().toISOString();
      
      const saleId = await db.sales.add({
        total: cartTotal,
        paymentMethod,
        sellerId: currentSeller?.id,
        sellerName: currentSeller?.name,
        status: 'completed',
        createdAt: now,
      });

      const saleItems = cart.map(item => ({
        saleId,
        productId: item.productId,
        productName: item.productName,
        price: item.price,
        quantity: item.quantity,
        subtotal: item.subtotal,
        category: item.category,
      }));
      await db.saleItems.bulkAdd(saleItems);

      // --- LOGICA DE STOCK MEJORADA (TROZOS) ---
      for (const item of cart) {
        if (item.category !== 'vitrina') continue; // Solo pasteles

        const isSlice = item.productName.includes('(Trozo)');
        let quantityNeeded = item.quantity;
        const product = await db.products.get(item.productId);
        const slicesPerUnit = product?.slices || 8; // Default 8 si no está definido

        while (quantityNeeded > 0) {
          if (isSlice) {
            // 1. Buscar Trozo suelto
            const slice = await db.showcaseItems
              .where({ productId: item.productId, status: 'active', showcaseType: 'trozado' })
              .first();
            
            if (slice) {
              await db.showcaseItems.update(slice.id, { status: 'sold', removedAt: now, saleId });
              quantityNeeded--;
            } else {
              // 2. Si no hay trozo, abrir Entero
              const whole = await db.showcaseItems
                .where({ productId: item.productId, status: 'active' })
                .filter(i => i.showcaseType !== 'trozado')
                .first();

              if (whole) {
                // Marcar entero como "cortado" (ya no existe como entero)
                await db.showcaseItems.update(whole.id, { status: 'sliced', removedAt: now, slicedAt: now });

                // Crear los N trozos nuevos
                const newSlices = [];
                // El primer trozo es el que se vende AHORA
                const soldSlice = {
                  productId: item.productId,
                  placedAt: whole.placedAt,
                  removedAt: now,
                  status: 'sold',
                  showcaseType: 'trozado',
                  parentId: whole.id,
                  slicedAt: now,
                  saleId,
                };
                await db.showcaseItems.add(soldSlice);
                quantityNeeded--;

                // Los otros (slices - 1) quedan disponibles en vitrina
                for (let i = 1; i < slicesPerUnit; i++) {
                  newSlices.push({
                    productId: item.productId,
                    placedAt: whole.placedAt,
                    status: 'active',
                    showcaseType: 'trozado',
                    parentId: whole.id,
                    slicedAt: now,
                    slicePrice: Math.round(product.price / slicesPerUnit)
                  });
                }
                if (newSlices.length > 0) await db.showcaseItems.bulkAdd(newSlices);
              } else {
                // No hay stock físico -> Venta forzada (salir del bucle)
                break;
              }
            }
          } else {
            // Venta de Entero
            const whole = await db.showcaseItems
              .where({ productId: item.productId, status: 'active' })
              .filter(i => i.showcaseType !== 'trozado')
              .first();

            if (whole) {
              await db.showcaseItems.update(whole.id, { status: 'sold', removedAt: now, saleId });
              quantityNeeded--;
            } else {
              break; // Sin stock
            }
          }
        }
      }
      // ----------------------------------------

      const openRegister = await db.cashRegister.where('status').equals('open').first();
      if (openRegister) {
        await db.cashMovements.add({
          registerId: openRegister.id,
          type: 'sale',
          amount: cartTotal,
          description: `Venta #${saleId}`,
          paymentMethod,
          saleId,
          createdAt: now,
        });
      }

      setLastSale({
        id: saleId,
        items: cart,
        total: cartTotal,
        paymentMethod,
        cashReceived: paymentMethod === 'efectivo' ? parseInt(cashReceived) || 0 : 0,
        change,
        seller: currentSeller?.name,
        date: now,
      });

      setCart([]);
      setShowPayment(false);
      setCashReceived('');
      setPaymentMethod('efectivo');
      setShowReceipt(true);
      
      await logAction(ACTIONS.SALE, currentSeller?.id, `Venta #${saleId} - ${formatCurrency(cartTotal)} (${paymentMethod})`);
      toast.success(`Venta #${saleId} completada — ${formatCurrency(cartTotal)}`);
    } catch (err) {
      toast.error('Error al registrar la venta: ' + err.message);
    } finally {
      setProcessingPayment(false);
    }
  };

  return (
    <div>
      <div className="pos-layout">
        {/* LEFT: Products */}
        <div className="pos-products">
          {/* Search & Filters */}
          <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
              <Search className="search-icon" size={18} />
              <input
                type="text"
                placeholder="Buscar producto..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Showcase filter toggle */}
            <label className="filter-toggle">
              <input
                type="checkbox"
                checked={onlyInShowcase}
                onChange={e => setOnlyInShowcase(e.target.checked)}
              />
              <MapPin size={14} />
              <span>Solo en vitrina</span>
            </label>
          </div>

          <div className="tabs" style={{ marginTop: 'var(--space-md)' }}>
            {Object.entries(categoryLabel).map(([key, label]) => (
              <button
                key={key}
                className={`tab ${activeCategory === key ? 'active' : ''}`}
                onClick={() => setActiveCategory(key)}
              >
                {key !== 'todos' && categoryEmoji[key]} {label}
              </button>
            ))}
          </div>

          {/* Product Grid */}
          <div className="pos-products-grid">
            {filteredProducts.length === 0 ? (
              <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
                <Search size={48} />
                <h3>Sin resultados</h3>
                <p>{onlyInShowcase ? 'No hay productos en vitrina actualmente' : 'No se encontraron productos'}</p>
              </div>
            ) : (
              filteredProducts.map(product => {
                const stock = stockMap[product.id];
                const hasStock = stock && stock.total > 0;

                return (
                  <button
                    key={product.id}
                    className={`pos-product-btn ${onlyInShowcase && !hasStock ? 'out-of-stock' : ''}`}
                    onClick={() => handleProductClick(product)}
                    disabled={onlyInShowcase && !hasStock}
                  >
                    {/* Info tooltip */}
                    {product.description && <ProductInfoTooltip product={product} />}

                    {product.photo ? (
                      <img src={product.photo} alt={product.name} className="pos-product-photo" />
                    ) : (
                      <span className="pos-product-emoji">{categoryEmoji[product.category] || '📦'}</span>
                    )}
                    <span className="pos-product-name">{product.name}</span>
                    <span className="pos-product-price">{formatCurrency(product.price)}</span>

                    {/* Stock indicator */}
                    {hasStock && (
                      <div className="stock-indicator">
                        {stock.enteros > 0 && (
                          <span className="stock-badge stock-entero">
                            <Package size={10} /> {stock.enteros}
                          </span>
                        )}
                        {stock.trozos > 0 && (
                          <span className="stock-badge stock-trozo">
                            <Scissors size={10} /> {stock.trozos}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT: Cart */}
        <div className="pos-cart">
          <div className="pos-cart-header">
            <h3 style={{ fontFamily: 'var(--font-body)', fontSize: '1rem' }}>
              <ShoppingCart size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
              Carrito ({cartCount})
            </h3>
            {cart.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={clearCart}>
                <Trash2 size={14} /> Limpiar
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="pos-cart-empty">
              <ShoppingCart size={48} className="icon" />
              <p>Agrega productos para comenzar</p>
            </div>
          ) : (
            <div className="pos-cart-items">
              {cart.map(item => (
                <div key={`${item.productId}-${item.productName}`} className="pos-cart-item">
                  <div className="pos-cart-item-info">
                    <div className="pos-cart-item-name">{item.productName}</div>
                    <div className="pos-cart-item-price">{formatCurrency(item.price)} c/u</div>
                  </div>
                  <div className="pos-cart-qty">
                    <button onClick={() => updateQuantity(item.productId, item.productName, -1)}>
                      <Minus size={14} />
                    </button>
                    <span>{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.productId, item.productName, 1)}>
                      <Plus size={14} />
                    </button>
                  </div>
                  <span className="pos-cart-item-subtotal">{formatCurrency(item.subtotal)}</span>
                  <button className="pos-cart-remove" onClick={() => removeFromCart(item.productId, item.productName)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {cart.length > 0 && (
            <div className="pos-cart-footer">
              <div className="pos-cart-total">
                <span>Total</span>
                <span className="amount">{formatCurrency(cartTotal)}</span>
              </div>
              <button className="btn btn-primary pos-pay-btn" onClick={() => setShowPayment(true)}>
                <CreditCard size={20} /> Cobrar
              </button>
            </div>
          )}
        </div>
      </div>

      <TypeModal
        showTypeModal={showTypeModal}
        onClose={() => setShowTypeModal(null)}
        onSelectEntero={() => { addToCart(showTypeModal.product); setShowTypeModal(null); }}
        onSelectTrozo={() => {
          addToCart(
            showTypeModal.product,
            showTypeModal.stock.slicePrice || Math.round(showTypeModal.product.price / (showTypeModal.product.slices || 8)),
            `${showTypeModal.product.name} (Trozo)`
          );
          setShowTypeModal(null);
        }}
      />

      <PaymentModal
        show={showPayment}
        cartTotal={cartTotal}
        paymentMethod={paymentMethod}
        cashReceived={cashReceived}
        change={change}
        processingPayment={processingPayment}
        onPaymentMethodChange={setPaymentMethod}
        onCashReceivedChange={setCashReceived}
        onConfirm={completeSale}
        onClose={() => setShowPayment(false)}
      />

      <ReceiptModal
        show={showReceipt}
        lastSale={lastSale}
        onClose={() => setShowReceipt(false)}
      />
    </div>
  );
}
