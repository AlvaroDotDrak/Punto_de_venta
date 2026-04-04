/**
 * Ventas (POS) — Punto de venta principal
 * V3.0: consume FastAPI backend en vez de Dexie
 */
import { useState, useEffect, useMemo } from 'react';
import { useSeller } from '../context/SellerContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import { formatCurrency } from '../utils/formatters';
import ProductInfoTooltip from '../components/ProductInfoTooltip';
import { Search, MapPin } from 'lucide-react';
import TypeModal from '../components/Ventas/TypeModal';
import PaymentModal from '../components/Ventas/PaymentModal';
import ReceiptModal from '../components/Ventas/ReceiptModal';

const categoryEmoji = { vitrina: '🍰', salados: '🥪', encargo: '🎂' };
const categoryLabel = { todos: 'Todos', vitrina: 'Vitrina', salados: 'Salados', encargo: 'Encargo' };

export default function Ventas() {
  const { currentSeller } = useSeller();
  const toast = useToast();

  const [products, setProducts] = useState([]);
  const [showcaseItems, setShowcaseItems] = useState([]);
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
  const [showTypeModal, setShowTypeModal] = useState(null);

  const loadData = async () => {
    const [prods, showcase] = await Promise.all([
      api.get('/products'),
      api.get('/showcase?status=active'),
    ]);
    setProducts(prods);
    setShowcaseItems(showcase);
  };

  useEffect(() => { loadData(); }, []);

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
    return list;
  }, [products, activeCategory, search, onlyInShowcase, stockMap]);

  const addToCart = (product, overridePrice, overrideName, showcaseType = null) => {
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
      }];
    });
  };

  const handleProductClick = (product) => {
    const stock = stockMap[product.id];
    if (!stock || stock.total === 0) { addToCart(product); return; }
    if (stock.enteros > 0 && stock.trozos > 0) {
      setShowTypeModal({ product, stock });
      return;
    }
    if (stock.trozos > 0 && stock.enteros === 0) {
      addToCart(product, Math.round(product.price / (product.slices || 8)), `${product.name} (Trozo)`, 'trozado');
      return;
    }
    addToCart(product, null, null, 'entero');
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
        items: cart.map(i => ({
          product_id: i.product_id,
          product_name: i.product_name,
          price: i.price,
          quantity: i.quantity,
          subtotal: i.subtotal,
          showcase_type: i.showcase_type,
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
      });

      setCart([]);
      setShowPayment(false);
      setCashReceived('');
      setPaymentMethod('efectivo');
      setShowReceipt(true);
      toast.success(`Venta #${sale.id} completada — ${formatCurrency(cartTotal)}`);
      loadData(); // refrescar stock
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
          <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
              <Search className="search-icon" size={18} />
              <input type="text" placeholder="Buscar producto..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <label className="filter-toggle">
              <input type="checkbox" checked={onlyInShowcase}
                onChange={e => setOnlyInShowcase(e.target.checked)} />
              <MapPin size={14} />
              <span>Solo en vitrina</span>
            </label>
          </div>

          <div className="tabs" style={{ marginTop: 'var(--space-md)' }}>
            {Object.entries(categoryLabel).map(([key, label]) => (
              <button key={key} className={`tab ${activeCategory === key ? 'active' : ''}`}
                onClick={() => setActiveCategory(key)}>
                {key !== 'todos' && categoryEmoji[key]} {label}
              </button>
            ))}
          </div>

          <div className="pos-products-grid">
            {filteredProducts.length === 0 ? (
              <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
                <Search size={48} />
                <h3>Sin resultados</h3>
                <p>{onlyInShowcase ? 'No hay productos en vitrina actualmente' : 'No se encontraron productos'}</p>
              </div>
            ) : filteredProducts.map(product => {
              const stock = stockMap[product.id];
              const hasStock = stock && stock.total > 0;
              return (
                <button key={product.id}
                  className={`pos-product-btn ${onlyInShowcase && !hasStock ? 'out-of-stock' : ''}`}
                  onClick={() => handleProductClick(product)}
                  disabled={onlyInShowcase && !hasStock}>
                  {product.photo ? (
                    <div className="pos-product-photo">
                      <img src={product.photo} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
                    </div>
                  ) : (
                    <div className="pos-product-emoji">{categoryEmoji[product.category] || '🍞'}</div>
                  )}
                  <div className="pos-product-name">{product.name}</div>
                  <div className="pos-product-price">{formatCurrency(product.price)}</div>
                  {stock && stock.total > 0 && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-success)', marginTop: 2 }}>
                      {stock.enteros > 0 && `${stock.enteros} entero${stock.enteros > 1 ? 's' : ''}`}
                      {stock.enteros > 0 && stock.trozos > 0 && ' · '}
                      {stock.trozos > 0 && `${stock.trozos} trozo${stock.trozos > 1 ? 's' : ''}`}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Cart */}
        <div className="pos-cart">
          <div className="cart-header">
            <h3>Carrito {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}</h3>
            {cart.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setCart([])}>Limpiar</button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="cart-empty">
              <p>Selecciona productos</p>
            </div>
          ) : (
            <div className="cart-items">
              {cart.map(item => (
                <div key={`${item.product_id}-${item.product_name}`} className="cart-item">
                  <div className="cart-item-info">
                    <span className="cart-item-name">{item.product_name}</span>
                    <span className="cart-item-price">{formatCurrency(item.price)}</span>
                  </div>
                  <div className="cart-item-controls">
                    <button className="qty-btn" onClick={() => updateQuantity(item.product_id, item.product_name, -1)}>−</button>
                    <span className="qty-value">{item.quantity}</span>
                    <button className="qty-btn" onClick={() => updateQuantity(item.product_id, item.product_name, 1)}>+</button>
                    <button className="qty-btn remove" onClick={() => removeFromCart(item.product_id, item.product_name)}>✕</button>
                  </div>
                  <div className="cart-item-subtotal">{formatCurrency(item.subtotal)}</div>
                </div>
              ))}
            </div>
          )}

          <div className="cart-footer">
            <div className="cart-total">
              <span>Total</span>
              <span>{formatCurrency(cartTotal)}</span>
            </div>
            <button className="btn btn-primary btn-lg cart-checkout"
              disabled={cart.length === 0}
              onClick={() => setShowPayment(true)}>
              Cobrar
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
              addToCart(p, Math.round(p.price / (p.slices || 8)), `${p.name} (Trozo)`, 'trozado');
            } else {
              addToCart(p, null, null, 'entero');
            }
            setShowTypeModal(null);
          }}
          onClose={() => setShowTypeModal(null)}
        />
      )}

      {showPayment && (
        <PaymentModal
          total={cartTotal}
          paymentMethod={paymentMethod}
          cashReceived={cashReceived}
          change={change}
          processing={processingPayment}
          onMethodChange={setPaymentMethod}
          onCashChange={setCashReceived}
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
