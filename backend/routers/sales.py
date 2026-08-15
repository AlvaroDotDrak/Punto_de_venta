import math
from datetime import datetime, time, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import CashMovement, CashRegister, Sale, SaleItem, SalePayment, ShowcaseItem, Product, ProductRecipe, IngredientMovement
from ..auth import get_current_seller, require_admin, require_permission
from ..audit import ACTIONS, log_action
from ._common import parse_date_from, parse_date_to
from .config import _build_discounts, _get_weight_mode, _void_window_minutes, _history_days_limit
from ..schemas import SaleCreate, SaleOut, VoidSaleRequest, FixPaymentMethodRequest
from ..stock import ANULACION, VENTA, record_stock
from ..utils import calculate_recipe_fraction

router = APIRouter(prefix="/sales", tags=["sales"])

_PAYMENT_METHODS = ("efectivo", "tarjeta", "transferencia")


def _round_half_up(x: float) -> int:
    """Redondeo hacia arriba en .5, igual que Math.round del frontend (CLP sin decimales)."""
    return int(math.floor(x + 0.5))


def _authoritative_unit_price(product: Product, item_in, weight_mode: str = "kg") -> float:
    """Precio unitario recalculado desde el producto en la DB, replicando la
    lógica de precios de Ventas.jsx. Nunca se confía en el precio del cliente:
    así una venta manipulada no puede fijar montos arbitrarios.

    Única excepción: venta por peso en modo 'amount'. Ahí la balanza del local ya
    calculó el precio y la cajera tipea ese monto — el servidor no tiene con qué
    recalcularlo porque no conoce los gramos. No agrega riesgo respecto del modo
    'kg': tipear 0,5 kg en vez de 1,5 kg es exactamente el mismo fraude que
    tipear $5.000 en vez de $15.000, y ambos quedan en el audit log."""
    if item_in.showcase_type == "trozado":
        if product.slice_price is not None:
            return product.slice_price
        return _round_half_up(product.price / (product.slices or 8))
    if item_in.showcase_type == "entero":
        return product.price
    if product.sold_by == "weight":
        if weight_mode == "amount" and item_in.amount is not None:
            return _round_half_up(item_in.amount)
        if item_in.weight is not None:
            return _round_half_up((item_in.weight or 0) * product.price)
    return product.price


def _kg_consumidos(product: Product, item_in, weight_mode: str) -> float:
    """Kilos que salen del stock. En modo 'amount' se deducen del monto y del
    precio por kilo: es aproximado, pero mantiene el inventario vivo en vez de
    dejarlo congelado."""
    if weight_mode == "amount" and item_in.amount is not None:
        return (item_in.amount / product.price) if product.price else 0.0
    return item_in.weight or 0.0


def _handle_showcase_stock(db: Session, product_id: int, showcase_type: str, sale_id: int):
    """
    Lógica de trozado: equivalente al flujo crítico de Ventas.jsx.
    Actualiza showcaseItems al vender un entero o trozo.
    Si no hay stock en vitrina, lo crea automáticamente ("Vitrina Automática").
    """
    if showcase_type == "entero":
        item = db.query(ShowcaseItem).filter(
            ShowcaseItem.product_id == product_id,
            ShowcaseItem.showcase_type == "entero",
            ShowcaseItem.status == "active",
        ).first()
        if item:
            item.status = "sold"
            item.sale_id = sale_id
        else:
            # Vitrina Automática: Crear y marcar como vendido de inmediato
            db.add(ShowcaseItem(
                product_id=product_id,
                showcase_type="entero",
                status="sold",
                sale_id=sale_id
            ))
        return

    # Vender trozo
    trozo = db.query(ShowcaseItem).filter(
        ShowcaseItem.product_id == product_id,
        ShowcaseItem.showcase_type == "trozado",
        ShowcaseItem.status == "active",
    ).first()

    if trozo:
        trozo.status = "sold"
        trozo.sale_id = sale_id
        return

    # No hay trozos → rebanar un entero
    entero = db.query(ShowcaseItem).filter(
        ShowcaseItem.product_id == product_id,
        ShowcaseItem.showcase_type == "entero",
        ShowcaseItem.status == "active",
    ).first()

    product = db.query(Product).filter(Product.id == product_id).first()
    slices_count = product.slices if (product and product.slices) else 8

    if not entero:
        # Vitrina Automática: Crear un entero y trocearlo de inmediato
        entero = ShowcaseItem(
            product_id=product_id,
            showcase_type="entero",
            status="sliced",
            sliced_at=datetime.now()
        )
        db.add(entero)
        db.flush()  # Obtener ID para enlazar los trozos
    else:
        entero.status = "sliced"
        entero.sliced_at = datetime.now()

    # Crear (slices - 1) trozos nuevos activos
    for _ in range(slices_count - 1):
        db.add(ShowcaseItem(
            product_id=product_id,
            showcase_type="trozado",
            status="active",
            parent_id=entero.id,
        ))

    # El trozo vendido
    db.add(ShowcaseItem(
        product_id=product_id,
        showcase_type="trozado",
        status="sold",
        parent_id=entero.id,
        sale_id=sale_id,
    ))


@router.post("", response_model=SaleOut, status_code=201)
def create_sale(
    payload: SaleCreate,
    db: Session = Depends(get_db),
    seller=Depends(get_current_seller),
):
    # La caja debe estar abierta: sin esto, las ventas en efectivo quedarían
    # fuera del arqueo y el cierre del día no cuadraría.
    register = db.query(CashRegister).filter(CashRegister.status == "open").first()
    if not register:
        raise HTTPException(status_code=400, detail="La caja debe estar abierta para registrar ventas")

    # Cortesía: el producto sale del stock pero no se cobra. No es venta (no debe
    # inflar los ingresos) ni gasto (el costo ya se registró al comprarlo). Se
    # guarda el valor de lo regalado en `subtotal` para poder reportarlo, con
    # total=0 y sin boleta.
    es_cortesia = payload.payment_method == "cortesia"
    if es_cortesia:
        if not (seller.role in ("admin", "dev") or seller.can_give_courtesy):
            raise HTTPException(status_code=403, detail="Sin permisos para entregar cortesías")
        if not (payload.notes or "").strip():
            raise HTTPException(status_code=422, detail="La cortesía necesita un motivo")

    # Métodos de pago: en un pago mixto cada línea aporta su parte. Acá solo se
    # validan los métodos; los montos se validan tras recalcular el total en el
    # servidor. Una cortesía no se cobra, así que no lleva pagos.
    raw_payments = payload.payments or None
    if es_cortesia and raw_payments:
        raise HTTPException(status_code=422, detail="Una cortesía no se cobra: no lleva métodos de pago")
    if raw_payments:
        methods_used = [p.method for p in raw_payments]
        for m in methods_used:
            if m not in _PAYMENT_METHODS:
                raise HTTPException(status_code=422, detail=f"Método de pago inválido: {m}")
    else:
        # Sin desglose, 'mixto' dejaría un movimiento de caja con ese método,
        # invisible para el arqueo y los cuadros por método. Se exige el detalle.
        if payload.payment_method == "mixto":
            raise HTTPException(status_code=422, detail="Un pago mixto requiere el detalle de montos por método")
        if not es_cortesia and payload.payment_method not in _PAYMENT_METHODS:
            raise HTTPException(status_code=422, detail=f"Método de pago inválido: {payload.payment_method}")
        methods_used = [payload.payment_method]
    is_mixed = bool(raw_payments) and len(raw_payments) > 1

    # Boleta: un pago 100% tarjeta la fuerza (Mercado Pago la emite por el total).
    # En un pago mixto NO se fuerza: la parte débito emite su boleta sola por su
    # monto y Contabilidad la declara aparte (_boleta_base); acá el flag significa
    # "boleta manual por el total". Forzarlo declararía IVA por el efectivo también.
    if es_cortesia:
        has_receipt = False
    elif not is_mixed and methods_used[0] == "tarjeta":
        has_receipt = True
    else:
        has_receipt = bool(payload.has_receipt)
    sale_method = "mixto" if is_mixed else methods_used[0]
    weight_mode = _get_weight_mode(db)

    sale = Sale(
        total=0,  # se fija con el total recalculado en el servidor tras el loop
        payment_method=sale_method,
        seller_id=seller.id,
        order_id=payload.order_id,
        status="completed",
        has_receipt=has_receipt,
        notes=(payload.notes or "").strip() or None,
    )
    db.add(sale)
    db.flush()  # obtener sale.id antes de commit

    # Agregar items
    server_total = 0.0
    for item_in in payload.items:
        # Obtener información del producto
        product = None
        if item_in.product_id:
            product = db.query(Product).filter(Product.id == item_in.product_id).first()

        # Precio/subtotal autoritativos desde la DB. Sin producto (ítem manual sin
        # product_id) se conserva lo enviado por el cliente: no hay de dónde recalcular.
        if product:
            unit_price = _authoritative_unit_price(product, item_in, weight_mode)
            subtotal = unit_price * item_in.quantity
        else:
            unit_price = item_in.price
            subtotal = item_in.subtotal
        server_total += subtotal

        # Los kg de la línea se calculan acá y se guardan en el item: en modo
        # 'amount' derivan del monto y del precio vigente, y si no quedaran
        # escritos, una anulación posterior tendría que reestimarlos contra un
        # precio que pudo haber cambiado.
        kg_linea = None
        if product and product.sold_by == "weight" and not item_in.showcase_type:
            kg_linea = _kg_consumidos(product, item_in, weight_mode) or None

        item = SaleItem(
            sale_id=sale.id,
            product_id=item_in.product_id,
            product_name=item_in.product_name,
            price=unit_price,
            quantity=item_in.quantity,
            subtotal=subtotal,
            showcase_type=item_in.showcase_type,
            weight=kg_linea if kg_linea is not None else item_in.weight,
        )
        db.add(item)

        # Actualizar stock vitrina si aplica
        if item_in.showcase_type and item_in.product_id:
            for _ in range(item_in.quantity):
                _handle_showcase_stock(db, item_in.product_id, item_in.showcase_type, sale.id)
                db.flush()  # necesario: autoflush=False, sin esto el query del siguiente ciclo ve estado stale

        # Decrementar stock físico (bebidas, congelados). Por peso descuenta kg.
        if product and not item_in.showcase_type:
            if product.stock is not None:
                if product.sold_by == "weight":
                    consumed = (kg_linea or 0.0) * item_in.quantity
                    unit_label = "kg"
                else:
                    consumed = item_in.quantity
                    unit_label = "u"
                if product.stock < consumed:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Stock insuficiente para '{product.name}' (disponible: {product.stock:g} {unit_label})"
                    )
                record_stock(db, product, VENTA, -consumed,
                             seller_id=seller.id, sale_id=sale.id)

        # Descontar insumos basados en recetas de productos (si existen)
        if product:
            recipes = db.query(ProductRecipe).filter(ProductRecipe.product_id == item_in.product_id).all()
            if recipes:
                    # Calcular la fracción de la receta consumida
                    slices_count = product.slices if (product and product.slices) else 8
                    fraction = calculate_recipe_fraction(item_in.quantity, item_in.showcase_type, slices_count)

                    for r in recipes:
                        qty_used = (fraction * r.quantity) / r.yield_qty
                        # Registrar movimiento de consumo de ingredientes
                        movement = IngredientMovement(
                            ingredient_id=r.ingredient_id,
                            type="usage",
                            quantity=qty_used,
                            cost=qty_used * (r.ingredient.last_price or 0.0),
                            seller_id=seller.id,
                            sale_id=sale.id,
                            product_id=item_in.product_id
                        )
                        db.add(movement)
                        # Descontar stock (permite stock negativo)
                        r.ingredient.current_stock -= qty_used

    # Descuento: el cliente solo pide aplicarlo. El porcentaje sale de la config
    # del negocio y se valida acá — si viniera del cliente, cualquiera con la
    # consola abierta se haría un 90%.
    discount_percent = 0.0
    discount_amount = 0.0
    discount_label = None
    if payload.discount_id and not es_cortesia:
        if not (seller.role in ("admin", "dev") or seller.can_apply_discount):
            raise HTTPException(status_code=403, detail="Sin permisos para aplicar descuentos")
        elegido = next((d for d in _build_discounts(db) if d["id"] == payload.discount_id), None)
        if elegido is None:
            raise HTTPException(status_code=404, detail="Ese descuento no existe")
        if not elegido["active"]:
            detalle = (f"'{elegido['label']}' venció el {elegido['valid_until']}"
                       if elegido["expired"] else f"'{elegido['label']}' no está activo")
            raise HTTPException(status_code=400, detail=detalle)

        discount_label = elegido["label"]
        if elegido["type"] == "amount":
            # Gift card: monto fijo, topado al total. Si la card vale más que la
            # compra, la venta queda en $0 — no se devuelve vuelto ni queda saldo.
            discount_amount = min(_round_half_up(elegido["value"]), _round_half_up(server_total))
        else:
            discount_percent = elegido["value"]
            discount_amount = _round_half_up(server_total * discount_percent / 100)

    sale.subtotal = server_total          # valor de lista, incluso si es cortesía
    sale.discount_percent = discount_percent
    sale.discount_amount = discount_amount
    sale.discount_label = discount_label
    server_total = 0.0 if es_cortesia else (server_total - discount_amount)
    sale.total = server_total

    # Toda venta deja movimiento de caja, sea cual sea el método: la caja es el
    # registro completo del turno. Solo el efectivo afecta el cajón físico, y de
    # eso ya se encarga _expected_cash filtrando por payment_method.
    # En un pago mixto se reparte el total entre métodos: cada línea deja su
    # SalePayment (fuente de verdad del reparto) y su CashMovement, así el cuadro por
    # método sigue calzando sin lógica especial. Una venta simple es una sola línea.
    # Excepción: una cortesía no mueve plata. Un movimiento de $0 solo ensucia la
    # lista y hace que cuente como transacción en el cierre. La entrega queda
    # registrada en la venta, que es de donde el comprobante saca las cortesías.
    if not es_cortesia:
        if raw_payments:
            suma_pagos = _round_half_up(sum(p.amount for p in raw_payments))
            if suma_pagos != _round_half_up(server_total):
                raise HTTPException(
                    status_code=422,
                    detail=f"Los pagos suman ${suma_pagos:.0f} y el total es ${server_total:.0f}",
                )
            payment_lines = [(p.method, float(p.amount)) for p in raw_payments]
        else:
            payment_lines = [(payload.payment_method, server_total)]

        for method, amount in payment_lines:
            db.add(SalePayment(sale_id=sale.id, method=method, amount=amount))
            db.add(CashMovement(
                register_id=register.id,
                type="sale",
                amount=amount,
                payment_method=method,
                sale_id=sale.id,
                seller_id=seller.id,
            ))

    db.commit()
    db.refresh(sale)
    if es_cortesia:
        log_action(db, ACTIONS.SALE, seller.id,
                   f"Cortesía por ${sale.subtotal:.0f} — {sale.notes}")
    else:
        detalle_desc = (f" · {discount_label} (-${discount_amount:.0f})" if discount_amount else "")
        log_action(db, ACTIONS.SALE, seller.id,
                   f"Venta ${server_total:.0f} - {sale_method}{detalle_desc}")

    return db.query(Sale).options(
        joinedload(Sale.items), joinedload(Sale.seller), joinedload(Sale.payments)
    ).filter(Sale.id == sale.id).first()


@router.get("", response_model=list[SaleOut])
def list_sales(
    limit: int = Query(50, ge=1, le=2000),
    offset: int = 0,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
    seller=Depends(require_permission('can_access_historial')),
):
    q = db.query(Sale).options(
        joinedload(Sale.items), joinedload(Sale.seller), joinedload(Sale.payments)
    )
    dt_from = parse_date_from(date_from)
    dt_to = parse_date_to(date_to)

    # El tope se aplica acá y no solo en los selectores de fecha: un límite que vive
    # en el frontend se salta pidiendo /api/sales?date_from=... desde la consola.
    limite = _history_days_limit(db)
    if limite and seller.role not in ("admin", "dev"):
        # limite cuenta días incluyendo hoy: 1 = solo hoy.
        piso = datetime.combine(datetime.now().date() - timedelta(days=limite - 1), time.min)
        if dt_from is None or dt_from < piso:
            dt_from = piso

    if dt_from:
        q = q.filter(Sale.created_at >= dt_from)
    if dt_to:
        q = q.filter(Sale.created_at <= dt_to)
    return q.order_by(Sale.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/{sale_id}", response_model=SaleOut)
def get_sale(sale_id: int, db: Session = Depends(get_db), _=Depends(get_current_seller)):
    sale = (
        db.query(Sale)
        .options(joinedload(Sale.items), joinedload(Sale.seller), joinedload(Sale.payments))
        .filter(Sale.id == sale_id)
        .first()
    )
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    return sale


@router.post("/{sale_id}/void", response_model=SaleOut)
def void_sale(
    sale_id: int,
    payload: VoidSaleRequest,
    db: Session = Depends(get_db),
    seller=Depends(require_permission("can_void_sales")),
):
    if len(payload.reason) < 10:
        raise HTTPException(status_code=422, detail="La razón debe tener al menos 10 caracteres")

    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    if sale.status == "voided":
        raise HTTPException(status_code=400, detail="La venta ya fue anulada")

    # Ventana de anulación: se valida acá y no en el frontend porque un límite que
    # solo esconde el botón se salta desde la consola del navegador. El admin no
    # tiene límite: si hay que anular una venta vieja, que lo haga quien responde.
    limite = _void_window_minutes(db)
    if limite and seller.role not in ("admin", "dev") and sale.created_at:
        minutos = (datetime.now() - sale.created_at).total_seconds() / 60
        if minutos > limite:
            raise HTTPException(
                status_code=403,
                detail=f"Pasaron más de {limite} minutos desde la venta: solo un administrador puede anularla",
            )

    # Anular venta
    sale.status = "voided"
    sale.voided_at = datetime.now()
    sale.void_reason = payload.reason

    # Revertir stock físico de productos
    for item in sale.items:
        if item.product_id and not item.showcase_type:
            product = db.query(Product).filter(Product.id == item.product_id).first()
            if product and product.stock is not None:
                if product.sold_by == "weight":
                    # item.weight guarda los kg de la línea desde que la venta los
                    # persiste. Ventas viejas en modo 'amount' no los tienen: se
                    # estiman desde el monto cobrado, igual que se estimó el
                    # consumo al vender. (No usar _kg_consumidos acá: espera el
                    # payload del cliente, y un SaleItem no tiene `amount`.)
                    if item.weight is not None:
                        returned = item.weight * item.quantity
                    elif product.price:
                        returned = (item.price / product.price) * item.quantity
                    else:
                        returned = 0.0
                else:
                    returned = item.quantity
                record_stock(db, product, ANULACION, returned,
                             seller_id=seller.id, sale_id=sale_id,
                             notes=f"Anulación: {payload.reason}"[:200])

    # Revertir showcase items
    showcase_items = db.query(ShowcaseItem).filter(ShowcaseItem.sale_id == sale_id).all()
    for item in showcase_items:
        item.status = "active"
        item.sale_id = None

    # Revertir movimientos de insumos asociados a la venta
    ingredient_movements = db.query(IngredientMovement).filter(IngredientMovement.sale_id == sale_id).all()
    for mov in ingredient_movements:
        if mov.ingredient:
            # Al anular sumamos de vuelta lo consumido
            mov.ingredient.current_stock += mov.quantity
        db.delete(mov)

    # Movimiento de caja negativo, con el método original de la venta (solo el
    # efectivo descuenta del cajón; el resto es para que el resumen del turno
    # descuente la venta anulada de su método).
    # Solo la caja abierta recibe el movimiento. Antes, sin caja abierta, se
    # escribía en la caja (ya cerrada) de la venta original: eso reescribe un
    # cierre que alguien contó y firmó, y el resumen reimpreso o reenviado de ese
    # turno deja de calzar con el papel. Sin caja abierta, la anulación queda
    # registrada en la venta misma (status='voided') y Contabilidad la excluye.
    register = db.query(CashRegister).filter(CashRegister.status == "open").first()

    if register and sale.payment_method != "cortesia":
        # Un movimiento negativo por cada método con que se pagó, para que el cuadro
        # por método descuente la parte correcta. Ventas antiguas sin desglose (previas
        # al pago mixto) se revierten con una sola línea por el total.
        if sale.payments:
            for p in sale.payments:
                db.add(CashMovement(
                    register_id=register.id,
                    type="void",
                    amount=-p.amount,
                    payment_method=p.method,
                    sale_id=sale.id,
                    description=f"Anulación venta #{sale.id}",
                    seller_id=seller.id,
                ))
        else:
            db.add(CashMovement(
                register_id=register.id,
                type="void",
                amount=-sale.total,
                payment_method=sale.payment_method,
                sale_id=sale.id,
                description=f"Anulación venta #{sale.id}",
                seller_id=seller.id,
            ))

    db.commit()
    log_action(db, ACTIONS.VOID_SALE, seller.id, f"Venta #{sale_id} anulada: {payload.reason}")

    return db.query(Sale).options(
        joinedload(Sale.items), joinedload(Sale.seller), joinedload(Sale.payments)
    ).filter(Sale.id == sale_id).first()


@router.post("/{sale_id}/payment-method", response_model=SaleOut)
def fix_payment_method(
    sale_id: int,
    payload: FixPaymentMethodRequest,
    db: Session = Depends(get_db),
    seller=Depends(require_permission("can_void_sales")),
):
    """Corrige con qué se pagó una venta, sin anularla ni tocar su total.

    Marcar tarjeta cuando fue efectivo descuadra el cajón por ese monto, y hasta
    ahora la única salida era anular y rehacer la venta —o taparlo con un ingreso
    manual, que descuadra la contabilidad en vez del arqueo.

    Solo con el turno abierto: reescribir los movimientos de una caja ya cerrada
    cambiaría un arqueo que alguien contó y firmó.
    """
    sale = (
        db.query(Sale)
        .options(joinedload(Sale.payments))
        .filter(Sale.id == sale_id)
        .first()
    )
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    if sale.status == "voided":
        raise HTTPException(status_code=400, detail="La venta está anulada")
    if sale.payment_method == "cortesia":
        raise HTTPException(status_code=400, detail="Una cortesía no se cobró: no tiene método de pago")
    if sale.payment_method == payload.payment_method:
        raise HTTPException(status_code=400, detail="La venta ya está registrada con ese método")

    movimientos = db.query(CashMovement).filter(
        CashMovement.sale_id == sale.id, CashMovement.type == "sale"
    ).all()
    registros = {m.register_id for m in movimientos}
    for register_id in registros:
        register = db.query(CashRegister).filter(CashRegister.id == register_id).first()
        if register and register.status != "open":
            raise HTTPException(
                status_code=400,
                detail="El turno de esa venta ya está cerrado: la corrección cambiaría un arqueo firmado. "
                       "Registrá la diferencia en el turno actual.",
            )

    anterior = sale.payment_method
    for m in movimientos:
        db.delete(m)
    for p in list(sale.payments):
        db.delete(p)

    register = db.query(CashRegister).filter(CashRegister.status == "open").first()
    if register:
        db.add(SalePayment(sale_id=sale.id, method=payload.payment_method, amount=sale.total))
        db.add(CashMovement(
            register_id=register.id,
            type="sale",
            amount=sale.total,
            payment_method=payload.payment_method,
            sale_id=sale.id,
            seller_id=sale.seller_id,
            description=f"Venta #{sale.id} (método corregido)",
        ))

    sale.payment_method = payload.payment_method
    # Mercado Pago emite la boleta sola al cobrar con cualquier tarjeta (crédito
    # o débito); con los otros métodos la emisión vuelve a ser una decisión de
    # quien vende.
    if payload.payment_method in ("tarjeta", "debito"):
        sale.has_receipt = True

    db.commit()
    motivo = f": {payload.reason}" if payload.reason else ""
    log_action(db, ACTIONS.SALE_PAYMENT_FIXED, seller.id,
               f"Venta #{sale_id} corregida de {anterior} a {payload.payment_method}{motivo}")

    return db.query(Sale).options(
        joinedload(Sale.items), joinedload(Sale.seller), joinedload(Sale.payments)
    ).filter(Sale.id == sale_id).first()
