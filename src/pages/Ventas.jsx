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

const categoryEmoji = { vitrina: '🍰', salados: '🥪', encargo: '🎂', bebidas: '🥤', cafe: '☕' };
const categoryLabel = { todos: 'Todos', vitrina: 'Vitrina', salados: 'Salados', encargo: 'Encargo', bebidas: 'Bebidas', cafe: 'Café' };

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
      const slicePrice = product.slice_price ?? Math.round(product.price / (product.slices || 8));
      addToCart(product, slicePrice, `${product.name} (Trozo)`, 'trozado');
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
              const showcaseStock = stockMap[product.id];
              const hasShowcaseStock = showcaseStock && showcaseStock.total > 0;
              const physicalStock = product.stock;  // null = sin tracking, number = bebidas
              const outOfPhysicalStock = physicalStock !== null && physicalStock !== undefined && physicalStock <= 0;
              const isDisabled = (onlyInShowcase && !hasShowcaseStock) || outOfPhysicalStock;
              return (
                <button key={product.id}
                  className={`pos-product-btn ${isDisabled ? 'out-of-stock' : ''} ${product.photo ? 'has-photo' : ''}`}
                  onClick={() => handleProductClick(product)}
                  disabled={isDisabled}>
                  {product.photo ? (
                    <div className="pos-product-photo">
                      <img src={product.photo} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
                    </div>
                  ) : (
                    <div className="pos-product-emoji">{categoryEmoji[product.category] || '🍞'}</div>
                  )}
                  <div className="pos-product-name">{product.name}</div>
                  <div className="pos-product-price">{formatCurrency(product.price)}</div>
                  {showcaseStock && showcaseStock.total > 0 && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-success)', marginTop: 2 }}>
                      {showcaseStock.enteros > 0 && `${showcaseStock.enteros} entero${showcaseStock.enteros > 1 ? 's' : ''}`}
                      {showcaseStock.enteros > 0 && showcaseStock.trozos > 0 && ' · '}
                      {showcaseStock.trozos > 0 && `${showcaseStock.trozos} trozo${showcaseStock.trozos > 1 ? 's' : ''}`}
                    </div>
                  )}
                  {physicalStock !== null && physicalStock !== undefined && (
                    <div style={{ fontSize: '0.7rem', color: physicalStock > 0 ? 'var(--color-success)' : 'var(--color-danger)', marginTop: 2 }}>
                      {physicalStock > 0 ? `${physicalStock} en stock` : 'Sin stock'}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Cart */}
        <div className="pos-cart">
          <div className="pos-cart-header">
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              Carrito
              {cartCount > 0 && (
                <span style={{
                  background: 'var(--color-primary)',
                  color: '#fff',
                  borderRadius: '999px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  minWidth: 20,
                  height: 20,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 6px',
                }}>{cartCount}</span>
              )}
            </h3>
            {cart.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setCart([])}>Limpiar</button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="pos-cart-empty">
              <span className="icon" style={{ fontSize: '2.5rem' }}>🛒</span>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>Selecciona productos</p>
            </div>
          ) : (
            <div className="pos-cart-items">
              {cart.map(item => (
                <div key={`${item.product_id}-${item.product_name}`} className="pos-cart-item">
                  <div className="pos-cart-item-info">
                    <div className="pos-cart-item-name">{item.product_name}</div>
                    <div className="pos-cart-item-price">{formatCurrency(item.price)} c/u</div>
                  </div>
                  <div className="pos-cart-qty">
                    <button onClick={() => updateQuantity(item.product_id, item.product_name, -1)}>−</button>
                    <span>{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.product_id, item.product_name, 1)}>+</button>
                  </div>
                  <div className="pos-cart-item-subtotal">{formatCurrency(item.subtotal)}</div>
                  <button className="pos-cart-remove" onClick={() => removeFromCart(item.product_id, item.product_name)}>✕</button>
                </div>
              ))}
            </div>
          )}

          <div className="pos-cart-footer">
            <div className="pos-cart-total">
              <span>Total</span>
              <span className="amount">{formatCurrency(cartTotal)}</span>
            </div>
            <button className="btn btn-primary pos-pay-btn"
              disabled={cart.length === 0}
              onClick={() => setShowPayment(true)}>
              Cobrar {cartTotal > 0 && formatCurrency(cartTotal)}
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
