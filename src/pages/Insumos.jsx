/**
 * Insumos — Gestión de ingredientes y gastos de producción
 * Permite registrar compras, ajustar stock y ver alertas de stock bajo.
 */
import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useToast } from '../context/ToastContext';
import { useSeller } from '../context/SellerContext';
import { formatCurrency, formatDate } from '../utils/formatters';
import { logAction, ACTIONS } from '../utils/auditLog';
import { 
  Package, Plus, Search, AlertTriangle, 
  History, ShoppingCart, Edit, Trash2, 
  ChevronRight, ArrowDown, ArrowUp, X 
} from 'lucide-react';

const emptyIngredient = {
  name: '',
  unit: 'kg', // kg, gr, l, ml, unidad, docena
  currentStock: 0,
  minStock: 0,
  lastPrice: 0,
  category: 'reposteria',
  active: true
};

export default function Insumos() {
  const toast = useToast();
  const { currentSeller } = useSeller();
  
  // States
  const [searchTerm, setSearchTerm] = useState('');
  const [showIngredientModal, setShowIngredientModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState(null);
  const [ingredientForm, setIngredientForm] = useState(emptyIngredient);
  const [purchaseForm, setPurchaseForm] = useState({ ingredientId: '', quantity: '', cost: '', provider: '' });
  const [viewMode, setViewMode] = useState('inventory'); // 'inventory' | 'history'

  // Data
  const ingredients = useLiveQuery(() => 
    db.ingredients.toArray()
  , [], []);

  const movements = useLiveQuery(() => 
    db.ingredientMovements.reverse().limit(50).toArray()
  , [], []);

  // Helpers for history view
  const ingredientsMap = useMemo(() => {
    return Object.fromEntries(ingredients.map(i => [i.id, i]));
  }, [ingredients]);

  const openRegister = useLiveQuery(() =>
    db.cashRegister.where('status').equals('open').first()
  );

  // Filters
  const filteredIngredients = useMemo(() => {
    if (!searchTerm) return ingredients;
    const term = searchTerm.toLowerCase();
    return ingredients.filter(i => i.name.toLowerCase().includes(term));
  }, [ingredients, searchTerm]);

  const lowStockCount = useMemo(() => 
    ingredients.filter(i => i.currentStock <= i.minStock).length
  , [ingredients]);

  // Handlers
  const handleSaveIngredient = async () => {
    if (!ingredientForm.name.trim()) return toast.error('El nombre es obligatorio');
    
    try {
      if (editingIngredient) {
        await db.ingredients.update(editingIngredient.id, {
          ...ingredientForm,
          currentStock: Number(ingredientForm.currentStock),
          minStock: Number(ingredientForm.minStock)
        });
        toast.success('Insumo actualizado');
        await logAction(ACTIONS.INGREDIENT_UPDATE, currentSeller?.id, `Editó ${ingredientForm.name}`);
      } else {
        await db.ingredients.add({
          ...ingredientForm,
          currentStock: Number(ingredientForm.currentStock),
          minStock: Number(ingredientForm.minStock)
        });
        toast.success('Insumo registrado');
      }
      setShowIngredientModal(false);
      setIngredientForm(emptyIngredient);
      setEditingIngredient(null);
    } catch (err) {
      toast.error('Error al guardar: ' + err.message);
    }
  };

  const handleRegisterPurchase = async () => {
    const { ingredientId, quantity, cost } = purchaseForm;
    if (!ingredientId || !quantity || !cost) return toast.error('Todos los campos son obligatorios');

    const qty = Number(quantity);
    const totalCost = Number(cost);
    const ingredient = ingredients.find(i => i.id === Number(ingredientId));

    try {
      // 1. Update stock and last price
      await db.ingredients.update(ingredient.id, {
        currentStock: ingredient.currentStock + qty,
        lastPrice: Math.round(totalCost / qty)
      });

      // 2. Record movement
      await db.ingredientMovements.add({
        ingredientId: ingredient.id,
        type: 'purchase',
        quantity: qty,
        cost: totalCost,
        sellerId: currentSeller?.id,
        createdAt: new Date().toISOString()
      });

      // 3. IF register is open, add cash movement (expense)
      if (openRegister) {
        await db.cashMovements.add({
          registerId: openRegister.id,
          type: 'expense',
          amount: totalCost,
          description: `Compra: ${qty} ${ingredient.unit} de ${ingredient.name}`,
          paymentMethod: 'efectivo',
          createdAt: new Date().toISOString()
        });
        toast.info('Gasto registrado automáticamente en caja');
      } else {
        toast.warning('Compra registrada, pero no se pudo descontar de caja (está cerrada)');
      }

      await logAction(ACTIONS.INGREDIENT_PURCHASE, currentSeller?.id, `Compró ${qty} ${ingredient.unit} de ${ingredient.name}`);
      toast.success('Compra registrada exitosamente');
      setShowPurchaseModal(false);
      setPurchaseForm({ ingredientId: '', quantity: '', cost: '', provider: '' });
    } catch (err) {
      toast.error('Error al registrar compra: ' + err.message);
    }
  };

  const startEdit = (ing) => {
    setEditingIngredient(ing);
    setIngredientForm(ing);
    setShowIngredientModal(true);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Package size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Gestión de Insumos
        </h1>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <div className="quick-filters">
            <button className={`quick-filter ${viewMode === 'inventory' ? 'active' : ''}`} onClick={() => setViewMode('inventory')}>
              Inventario
            </button>
            <button className={`quick-filter ${viewMode === 'history' ? 'active' : ''}`} onClick={() => setViewMode('history')}>
              Historial
            </button>
          </div>
          <button className="btn btn-secondary" onClick={() => setShowPurchaseModal(true)}>
            <ShoppingCart size={18} /> Registrar Compra
          </button>
          <button className="btn btn-primary" onClick={() => { setShowIngredientModal(true); setEditingIngredient(null); setIngredientForm(emptyIngredient); }}>
            <Plus size={18} /> Nuevo Insumo
          </button>
        </div>
      </div>

      {viewMode === 'inventory' ? (
        <>
          <div className="search-bar" style={{ marginBottom: 'var(--space-md)' }}>
            <Search className="search-icon" size={20} />
            <input 
              type="text" 
              placeholder="Buscar por nombre (harina, azúcar, huevos...)" 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
            />
          </div>

          {lowStockCount > 0 && (
            <div className="alert alert-warning" style={{ marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <AlertTriangle size={20} />
              Hay <strong>{lowStockCount} insumos</strong> con stock bajo el mínimo. ¡Hora de ir a comprar!
            </div>
          )}

          <div className="grid-auto">
            {filteredIngredients.map(ing => {
              const isLowStock = ing.currentStock <= ing.minStock;
              return (
                <div key={ing.id} className={`card ${isLowStock ? 'alert-border' : ''}`} style={{ padding: 'var(--space-md)', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-sm)' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{ing.name}</h3>
                    <span className="badge">{ing.category}</span>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>Stock Actual</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: isLowStock ? 'var(--color-danger)' : 'var(--color-success)' }}>
                        {ing.currentStock} <span style={{ fontSize: '0.8rem', fontWeight: 400 }}>{ing.unit}</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>Último Precio</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{formatCurrency(ing.lastPrice)}</div>
                    </div>
                  </div>

                  {isLowStock && (
                    <div style={{ marginTop: 'var(--space-xs)', fontSize: '0.8rem', color: 'var(--color-danger)', fontWeight: 600 }}>
                      ⚠️ Bajo el mínimo ({ing.minStock} {ing.unit})
                    </div>
                  )}

                  <div style={{ marginTop: 'var(--space-md)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-xs)' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(ing)}>
                      <Edit size={14} /> Editar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredIngredients.length === 0 && (
            <div className="empty-state">
              <Package size={48} />
              <h3>No hay insumos registrados</h3>
              <p>Comienza agregando los ingredientes base de tu pastelería.</p>
            </div>
          )}
        </>
      ) : (
        /* History View */
        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><History size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} /> Últimos Movimientos</h3>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Insumo</th>
                  <th>Tipo</th>
                  <th>Cantidad</th>
                  <th>Costo Total</th>
                  <th>Responsable</th>
                </tr>
              </thead>
              <tbody>
                {movements.map(mov => {
                  const ing = ingredientsMap[mov.ingredientId];
                  return (
                    <tr key={mov.id}>
                      <td>{formatDate(mov.createdAt)}</td>
                      <td style={{ fontWeight: 600 }}>{ing?.name || 'Insumo eliminado'}</td>
                      <td>
                        <span className={`badge badge-${mov.type === 'purchase' ? 'fresh' : 'info'}`}>
                          {mov.type === 'purchase' ? 'Compra' : 'Ajuste'}
                        </span>
                      </td>
                      <td style={{ color: mov.quantity > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {mov.quantity > 0 ? '+' : ''}{mov.quantity} {ing?.unit}
                      </td>
                      <td>{mov.cost > 0 ? formatCurrency(mov.cost) : '—'}</td>
                      <td style={{ fontSize: '0.85rem' }}>ID: {mov.sellerId || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ingredient Modal */}
      {showIngredientModal && (
        <div className="modal-overlay" onClick={() => setShowIngredientModal(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingIngredient ? 'Editar Insumo' : 'Nuevo Insumo'}</h2>
              <button className="modal-close" onClick={() => setShowIngredientModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input 
                  type="text" className="form-input" placeholder="Ej: Harina de Trigo" 
                  value={ingredientForm.name} onChange={e => setIngredientForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Unidad</label>
                  <select className="form-select" value={ingredientForm.unit} onChange={e => setIngredientForm(f => ({ ...f, unit: e.target.value }))}>
                    <option value="kg">Kilos (kg)</option>
                    <option value="gr">Gramos (gr)</option>
                    <option value="l">Litros (l)</option>
                    <option value="ml">Mililitros (ml)</option>
                    <option value="unidad">Unidades</option>
                    <option value="docena">Docenas</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Categoría</label>
                  <select className="form-select" value={ingredientForm.category} onChange={e => setIngredientForm(f => ({ ...f, category: e.target.value }))}>
                    <option value="reposteria">Repostería</option>
                    <option value="lacteos">Lácteos</option>
                    <option value="frutas">Frutas / Verduras</option>
                    <option value="desechables">Desechables</option>
                    <option value="otros">Otros</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Stock Actual</label>
                  <input 
                    type="number" className="form-input" 
                    value={ingredientForm.currentStock} onChange={e => setIngredientForm(f => ({ ...f, currentStock: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Stock Mínimo</label>
                  <input 
                    type="number" className="form-input" 
                    value={ingredientForm.minStock} onChange={e => setIngredientForm(f => ({ ...f, minStock: e.target.value }))}
                  />
                  <small style={{ fontSize: '0.7rem', color: 'var(--color-text-light)' }}>Avisar cuando quede menos de...</small>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowIngredientModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveIngredient}>Guardar Insumo</button>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Modal */}
      {showPurchaseModal && (
        <div className="modal-overlay" onClick={() => setShowPurchaseModal(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><ShoppingCart size={20} /> Registrar Compra</h2>
              <button className="modal-close" onClick={() => setShowPurchaseModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {!openRegister && (
                <div className="alert alert-danger" style={{ marginBottom: 'var(--space-md)', fontSize: '0.85rem' }}>
                  ⚠️ <strong>Caja cerrada:</strong> El gasto se registrará pero no se descontará del efectivo del turno actual.
                </div>
              )}
              
              <div className="form-group">
                <label className="form-label">Seleccionar Insumo *</label>
                <select 
                  className="form-select" 
                  value={purchaseForm.ingredientId} 
                  onChange={e => setPurchaseForm(f => ({ ...f, ingredientId: e.target.value }))}
                >
                  <option value="">-- Seleccionar --</option>
                  {ingredients.map(i => (
                    <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                  ))}
                </select>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Cantidad comprada *</label>
                  <input 
                    type="number" className="form-input" placeholder="Ej: 5"
                    value={purchaseForm.quantity} onChange={e => setPurchaseForm(f => ({ ...f, quantity: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Costo Total ($) *</label>
                  <input 
                    type="number" className="form-input" placeholder="Ej: 15000"
                    value={purchaseForm.cost} onChange={e => setPurchaseForm(f => ({ ...f, cost: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Proveedor / Lugar (Opcional)</label>
                <input 
                  type="text" className="form-input" placeholder="Ej: Supermercado Lider"
                  value={purchaseForm.provider} onChange={e => setPurchaseForm(f => ({ ...f, provider: e.target.value }))}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowPurchaseModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleRegisterPurchase}>Confirmar Compra</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
