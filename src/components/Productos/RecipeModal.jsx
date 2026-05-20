import { useState, useEffect, useMemo } from 'react';
import { X, Plus, Trash2, ChefHat, Info, DollarSign, Calculator } from 'lucide-react';
import api from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { formatCurrency } from '../../utils/formatters';

const UNIT_OPTIONS = ['g', 'kg', 'ml', 'l', 'unidad', 'docena'];

const FRIENDLY_UNIT_MAP = {
  gr: 'g', grs: 'g', gramos: 'g',
  kilo: 'kg', kilos: 'kg', kg: 'kg',
  litro: 'l', litros: 'l', l: 'l',
  ml: 'ml', cc: 'ml',
  unid: 'unidad', unidades: 'unidad', unidad: 'unidad',
  docena: 'docena', docenas: 'docena'
};

const getConversionFactor = (fromUnit, toUnit) => {
  let from = fromUnit.toLowerCase().trim();
  let to = toUnit.toLowerCase().trim();

  from = FRIENDLY_UNIT_MAP[from] || from;
  to = FRIENDLY_UNIT_MAP[to] || to;

  if (from === to) return 1.0;

  const key = `${from}_${to}`;
  const factors = {
    'g_kg': 0.001,
    'kg_g': 1000.0,
    'ml_l': 0.001,
    'l_ml': 1000.0,
    'unidad_docena': 1 / 12,
    'docena_unidad': 12.0
  };

  return factors[key] !== undefined ? factors[key] : null;
};

export default function RecipeModal({ product, onClose }) {
  const toast = useToast();
  const [ingredients, setIngredients] = useState([]);
  const [recipeItems, setRecipeItems] = useState([]);
  const [yieldQty, setYieldQty] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states for adding a new item
  const [selectedIngId, setSelectedIngId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('g');

  useEffect(() => {
    const initModal = async () => {
      try {
        setLoading(true);
        // Cargar insumos activos
        const ingData = await api.get('/ingredients');
        setIngredients(ingData);

        // Cargar receta actual del producto
        const recipeData = await api.get(`/products/${product.id}/recipe`);
        
        if (recipeData.length > 0) {
          // Usamos el yield_qty del primer item (todos comparten el mismo yield en la receta)
          setYieldQty(recipeData[0].yield_qty);
          
          // Mapeamos los datos de base de datos a nuestro estado local
          const mapped = recipeData.map(item => {
            const baseUnit = item.ingredient_unit || 'unidad';
            const ing = ingData.find(i => i.id === item.ingredient_id);
            // Por defecto, mostramos al usuario en la misma unidad que está el insumo
            return {
              ingredient_id: item.ingredient_id,
              name: item.ingredient_name,
              quantity: item.quantity,
              unit: baseUnit,
              base_unit: baseUnit,
              last_price: ing?.last_price || 0
            };
          });
          setRecipeItems(mapped);
        } else {
          // Valores por defecto
          setYieldQty(product.category === 'vitrina' ? 1 : 12);
          setRecipeItems([]);
        }
      } catch (err) {
        toast.error('Error al cargar datos de receta');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    initModal();
  }, [product, toast]);

  // Al seleccionar un ingrediente del selector, auto-configurar la unidad recomendada
  const handleIngredientChange = (id) => {
    setSelectedIngId(id);
    const ing = ingredients.find(i => i.id === parseInt(id));
    if (ing) {
      // Intentar usar su unidad base o una común
      const base = ing.unit.toLowerCase().trim();
      setSelectedUnit(FRIENDLY_UNIT_MAP[base] || base);
    }
  };

  const handleAddItem = (e) => {
    e.preventDefault();
    if (!selectedIngId) {
      toast.error('Selecciona un insumo');
      return;
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Ingresa una cantidad válida mayor a 0');
      return;
    }

    const ing = ingredients.find(i => i.id === parseInt(selectedIngId));
    if (!ing) return;

    // Verificar si ya existe en la lista local para consolidarlo
    const existsIndex = recipeItems.findIndex(item => item.ingredient_id === ing.id);
    if (existsIndex > -1) {
      // Consolidar cantidades en la unidad actual del item existente
      const existingItem = recipeItems[existsIndex];
      const factor = getConversionFactor(selectedUnit, existingItem.unit);
      const newQty = existingItem.quantity + (qty * factor);
      
      const updated = [...recipeItems];
      updated[existsIndex] = {
        ...existingItem,
        quantity: Math.round(newQty * 1000) / 1000
      };
      setRecipeItems(updated);
      toast.info(`Consolidado '${ing.name}' sumando la cantidad.`);
    } else {
      const base = ing.unit.toLowerCase().trim();
      const baseUnit = FRIENDLY_UNIT_MAP[base] || base;
      
      setRecipeItems(prev => [
        ...prev,
        {
          ingredient_id: ing.id,
          name: ing.name,
          quantity: qty,
          unit: selectedUnit,
          base_unit: baseUnit,
          last_price: ing.last_price || 0
        }
      ]);
    }

    // Resetear formulario de adición
    setSelectedIngId('');
    setQuantity('');
  };

  const handleRemoveItem = (index) => {
    setRecipeItems(prev => prev.filter((_, i) => i !== index));
  };

  // Calcular el costo por fila y el costo total del lote
  const costCalculations = useMemo(() => {
    let totalBatchCost = 0;
    let hasError = false;
    const itemsWithCost = recipeItems.map(item => {
      // Convertimos la cantidad local a la unidad base de base de datos para multiplicar por el costo base
      const factor = getConversionFactor(item.unit, item.base_unit);
      if (factor === null) {
        hasError = true;
        return {
          ...item,
          rowCost: null
        };
      }
      const qtyInBaseUnit = item.quantity * factor;
      const rowCost = qtyInBaseUnit * item.last_price;
      totalBatchCost += rowCost;
      return {
        ...item,
        rowCost
      };
    });

    const costPerUnit = yieldQty > 0 ? totalBatchCost / yieldQty : 0;

    return {
      items: itemsWithCost,
      totalBatchCost,
      costPerUnit,
      hasError
    };
  }, [recipeItems, yieldQty]);

  const handleSave = async () => {
    if (yieldQty <= 0) {
      toast.error('El rendimiento debe ser mayor a 0');
      return;
    }

    try {
      setSaving(true);
      // Mapear los items locales al esquema backend: { ingredient_id, quantity, unit, yield_qty }
      const payload = {
        items: recipeItems.map(item => ({
          ingredient_id: item.ingredient_id,
          quantity: item.quantity,
          unit: item.unit,
          yield_qty: yieldQty
        }))
      };

      await api.post(`/products/${product.id}/recipe`, payload);
      toast.success('Receta guardada exitosamente');
      onClose();
    } catch (err) {
      toast.error('Error al guardar la receta: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%' }}>
        <div className="modal-header" style={{ paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(201, 123, 75, 0.2), rgba(220, 150, 100, 0.05))',
              padding: '8px',
              borderRadius: '12px',
              border: '1px solid rgba(201, 123, 75, 0.3)',
              color: 'var(--color-primary)'
            }}>
              <ChefHat size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Receta & Costos</h2>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                Configura los insumos para: <strong>{product.name}</strong>
              </p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            Cargando ingredientes y recetas...
          </div>
        ) : (
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem 0' }}>
            
            {/* Rendimiento Config */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '15px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
              padding: '12px 18px',
              borderRadius: '12px',
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
                <Info size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)' }}>
                  ¿Cuánto rinde este lote de receta?
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  className="form-input"
                  style={{ width: '90px', textAlign: 'center', marginBottom: 0 }}
                  value={yieldQty}
                  onChange={e => setYieldQty(Math.max(0.01, parseFloat(e.target.value) || 1))}
                />
                <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>
                  {product.category === 'vitrina' ? 'unidad (ej: 1 Torta)' : 'unidades'}
                </span>
              </div>
            </div>

            {/* Agregar ingrediente Form */}
            <form onSubmit={handleAddItem} style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr auto',
              gap: '12px',
              alignItems: 'end',
              background: 'rgba(255,255,255,0.01)',
              padding: '14px',
              borderRadius: '12px',
              border: '1px dashed rgba(255,255,255,0.08)'
            }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '4px' }}>Insumo Base</label>
                <select
                  className="form-input"
                  value={selectedIngId}
                  onChange={e => handleIngredientChange(e.target.value)}
                  style={{ marginBottom: 0 }}
                >
                  <option value="">-- Seleccionar --</option>
                  {ingredients.map(ing => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name} ({ing.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '4px' }}>Cantidad</label>
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  className="form-input"
                  placeholder="Ej: 500"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  style={{ marginBottom: 0 }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '4px' }}>Unidad</label>
                <select
                  className="form-input"
                  value={selectedUnit}
                  onChange={e => setSelectedUnit(e.target.value)}
                  style={{ marginBottom: 0 }}
                >
                  {UNIT_OPTIONS.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              <button type="submit" className="btn btn-primary" style={{ height: '40px', padding: '0 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={16} /> Añadir
              </button>
            </form>

            {/* Listado de ingredientes agregados */}
            <div style={{
              maxHeight: '260px',
              overflowY: 'auto',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '12px',
              background: 'rgba(0,0,0,0.1)'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Insumo</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Cantidad Receta</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Costo Unit. Insumo</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Subtotal Costo</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center', width: '50px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {costCalculations.items.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-light)' }}>
                        Sin insumos asociados a la receta. Agrega ingredientes arriba.
                      </td>
                    </tr>
                  ) : (
                    costCalculations.items.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.name}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          {item.quantity} {item.unit}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                          {formatCurrency(item.last_price)} / {item.base_unit}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: item.rowCost === null ? 'var(--color-danger)' : 'inherit' }}>
                          {item.rowCost === null ? '⚠️ Unidades incompatibles' : formatCurrency(item.rowCost)}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleRemoveItem(idx)}
                            style={{ color: 'var(--color-danger)', padding: '4px' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Panel de Resumen de Costos Teóricos */}
            {costCalculations.items.length > 0 && !costCalculations.hasError && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '12px',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '12px',
                padding: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    color: 'var(--color-text-secondary)',
                    padding: '8px',
                    borderRadius: '8px'
                  }}>
                    <Calculator size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>Costo Total Lote ({yieldQty} ud)</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{formatCurrency(costCalculations.totalBatchCost)}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: '16px' }}>
                  <div style={{
                    background: 'rgba(201, 123, 75, 0.1)',
                    color: 'var(--color-primary)',
                    padding: '8px',
                    borderRadius: '8px'
                  }}>
                    <DollarSign size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>Costo Unitario Teórico</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                      {formatCurrency(costCalculations.costPerUnit)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: '16px' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>Precio Venta Unitario</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{formatCurrency(product.price)}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-success)' }}>
                      Margen: {product.price > 0 ? Math.round(((product.price - costCalculations.costPerUnit) / product.price) * 100) : 0}%
                    </div>
                  </div>
                </div>
              </div>
            )}

            {costCalculations.hasError && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '12px 18px',
                borderRadius: '12px',
                color: 'var(--color-danger)',
                fontSize: '0.88rem'
              }}>
                <Info size={18} />
                <span>Existen ingredientes con unidades incompatibles (ej. pesar litros en kilogramos). Por favor corrígelos o elimínalos antes de guardar.</span>
              </div>
            )}

          </div>
        )}

        <div className="modal-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || loading || costCalculations.hasError}>
            {saving ? 'Guardando...' : 'Guardar Receta'}
          </button>
        </div>
      </div>
    </div>
  );
}
