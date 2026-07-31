import base64
import binascii
import re
from datetime import datetime
from difflib import SequenceMatcher
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import (
    Expense, ExpenseCategory, Supplier, Product, Ingredient,
    IngredientMovement, PurchaseItem, SupplierItemAlias,
)
from ..auth import require_admin
from ..utils import normalize_description, detect_pack
from ..audit import ACTIONS, log_action
from ._common import parse_date_from, parse_date_to
from .expenses import _sync_cash_movement, _unlink_cash_movement
from .. import invoice_ai
from ..schemas import (
    PurchaseCreate, PurchaseOut, PurchaseItemOut, CostHistoryEntry,
    InvoiceScanRequest, InvoiceScanResponse, ScanDocumentOut, ScanLineOut,
    ScanChargeOut, ScanMatch, SupplierItemAliasOut, PurchaseDeleteResult,
)

router = APIRouter(tags=["purchases"])

IVA_RATE = 0.19


def _item_to_out(it: PurchaseItem, header_category_name: str) -> PurchaseItemOut:
    return PurchaseItemOut(
        id=it.id,
        product_id=it.product_id,
        ingredient_id=it.ingredient_id,
        category_id=it.category_id,
        # Si la línea no tiene categoría propia, hereda la de la factura.
        category_name=(it.category.name if it.category else header_category_name),
        description=it.description,
        quantity=it.quantity,
        unit_cost=it.unit_cost,
        line_total=it.line_total,
        units_per_pack=it.units_per_pack or 1.0,
        taxable=bool(it.taxable),
    )


def _learn_aliases(db: Session, payload: PurchaseCreate) -> None:
    """Guarda cada línea asignada a un producto/insumo como alias del proveedor, para
    que el próximo escaneo la reconozca sola. Sin proveedor no se aprende: el mismo
    texto puede significar cosas distintas en facturas de proveedores distintos."""
    if not payload.supplier_id:
        return

    for it in payload.items:
        if not (it.product_id or it.ingredient_id):
            continue
        norm = normalize_description(it.description)
        if not norm:
            continue

        alias = db.query(SupplierItemAlias).filter(
            SupplierItemAlias.supplier_id == payload.supplier_id,
            SupplierItemAlias.normalized_description == norm,
        ).first()

        if alias:
            alias.raw_description = it.description
            alias.product_id = it.product_id
            alias.ingredient_id = it.ingredient_id
            alias.units_per_pack = it.units_per_pack
            alias.times_seen = (alias.times_seen or 0) + 1
        else:
            db.add(SupplierItemAlias(
                supplier_id=payload.supplier_id,
                normalized_description=norm,
                raw_description=it.description,
                product_id=it.product_id,
                ingredient_id=it.ingredient_id,
                units_per_pack=it.units_per_pack,
            ))


def _purchase_to_out(e: Expense) -> PurchaseOut:
    # El neto es solo la base afecta; los cargos no afectos (IABA) quedan en el total
    # pero fuera de neto e IVA. Así el IVA derivado es 19% real del neto.
    net = sum(it.line_total for it in e.purchase_items if it.taxable)
    no_afecto = sum(it.line_total for it in e.purchase_items if not it.taxable)
    total = e.amount
    header_category_name = e.category.name if e.category else "Sin categoría"
    return PurchaseOut(
        id=e.id,
        invoice_number=e.invoice_number,
        category_id=e.category_id,
        category_name=header_category_name,
        supplier_id=e.supplier_id,
        supplier_name=e.supplier.name if e.supplier else None,
        document_type=e.document_type or 'factura',
        payment_method=e.payment_method,
        description=e.description,
        net_amount=round(net),
        tax_amount=round(total - net - no_afecto),
        total_amount=round(total),
        seller_name=e.seller.name if e.seller else "Desconocido",
        created_at=e.created_at,
        items=[_item_to_out(it, header_category_name) for it in e.purchase_items],
    )


@router.post("/purchases", response_model=PurchaseOut, status_code=201)
def create_purchase(
    payload: PurchaseCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    if not payload.items:
        raise HTTPException(status_code=400, detail="La factura debe tener al menos una línea")

    category = db.query(ExpenseCategory).filter(ExpenseCategory.id == payload.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    if payload.supplier_id is not None:
        supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id).first()
        if not supplier:
            raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    # Cargar dos veces la misma factura duplica el stock y pisa los costos sin que
    # nadie se entere. Con el escaneo IA (reintentar un PDF es barato) dejó de ser
    # hipotético. El folio es único por proveedor, así que esa es la clave.
    folio = _normalize_folio(payload.invoice_number)
    if folio and not payload.force:
        q = db.query(Expense).filter(Expense.invoice_number.isnot(None))
        q = (q.filter(Expense.supplier_id == payload.supplier_id) if payload.supplier_id
             else q.filter(Expense.supplier_id.is_(None)))
        for previa in q.all():
            if _normalize_folio(previa.invoice_number) != folio:
                continue
            raise HTTPException(status_code=409, detail={
                "message": (f"La factura {payload.invoice_number} ya se cargó el "
                            f"{previa.created_at.strftime('%d/%m/%Y')} por ${previa.amount:,.0f}"
                            .replace(",", ".")),
                "code": "duplicate_invoice",
                "expense_id": previa.id,
            })

    # Categorías de línea: las que difieran de la cabecera se validan en un solo query.
    line_category_ids = {it.category_id for it in payload.items if it.category_id and it.category_id != payload.category_id}
    if line_category_ids:
        found = {
            c.id for c in db.query(ExpenseCategory.id)
            .filter(ExpenseCategory.id.in_(line_category_ids)).all()
        }
        missing = line_category_ids - found
        if missing:
            raise HTTPException(status_code=404, detail=f"Categoría de línea no encontrada: {sorted(missing)}")

    # Si el documento es factura y los precios ya vienen con IVA, derivamos el neto
    # hacia atrás (÷1.19) en vez de sumarle IVA encima. divisor=1 → comportamiento normal.
    gross_input = payload.document_type == 'factura' and payload.prices_include_tax
    divisor = (1 + IVA_RATE) if gross_input else 1.0

    # raw_afecto entra a la base imponible; raw_no_afecto (IABA/ILA) suma al total
    # sin IVA. Un producto/insumo siempre es afecto; el flag solo aplica a líneas Otro.
    raw_afecto = 0.0
    raw_no_afecto = 0.0
    for it in payload.items:
        if it.product_id and it.ingredient_id:
            raise HTTPException(status_code=400, detail="Una línea no puede ser producto e insumo a la vez")
        if it.quantity <= 0:
            raise HTTPException(status_code=400, detail="Cantidad inválida en una línea")
        # Un costo negativo solo tiene sentido en una línea de solo gasto (descuento,
        # nota de crédito). En un producto/insumo implicaría "comprar cantidad negativa".
        es_solo_gasto = not it.product_id and not it.ingredient_id
        if it.unit_cost < 0 and not es_solo_gasto:
            raise HTTPException(status_code=400, detail="El costo negativo solo se permite en líneas de solo gasto (descuentos)")
        if it.units_per_pack <= 0:
            raise HTTPException(status_code=400, detail="Las unidades por pack deben ser mayores a cero")
        monto = it.quantity * it.unit_cost
        if it.taxable or not es_solo_gasto:
            raw_afecto += monto
        else:
            raw_no_afecto += monto

    if gross_input:
        # Los precios afectos vienen con IVA incluido; los no afectos son montos finales.
        net = raw_afecto / divisor
        tax = raw_afecto - net
        total = raw_afecto + raw_no_afecto
    else:
        net = raw_afecto
        tax = net * IVA_RATE if payload.document_type == 'factura' else 0.0
        total = net + tax + raw_no_afecto

    expense = Expense(
        category_id=payload.category_id,
        amount=round(total),
        description=payload.description,
        receipt_photo=payload.receipt_photo,
        document_type=payload.document_type,
        payment_method=payload.payment_method,
        seller_id=admin.id,
        supplier_id=payload.supplier_id,
        invoice_number=(payload.invoice_number or "").strip() or None,
    )
    db.add(expense)
    db.flush()  # obtener expense.id para las líneas
    _sync_cash_movement(db, expense, admin.id)

    for it in payload.items:
        es_solo_gasto = not it.product_id and not it.ingredient_id
        es_afecto = it.taxable or not es_solo_gasto
        # unit_cost y line_total se guardan en neto. El divisor descuenta el IVA solo
        # de las líneas afectas cuando vinieron con IVA; los cargos no afectos (IABA)
        # son montos finales y no se dividen.
        net_unit_cost = it.unit_cost / divisor if es_afecto else it.unit_cost
        line_total = it.quantity * net_unit_cost
        db.add(PurchaseItem(
            expense_id=expense.id,
            product_id=it.product_id,
            ingredient_id=it.ingredient_id,
            # Solo persistimos categoría si difiere de la cabecera; null = hereda la de la factura.
            category_id=it.category_id if (it.category_id and it.category_id != payload.category_id) else None,
            description=it.description,
            quantity=it.quantity,
            unit_cost=net_unit_cost,
            line_total=line_total,
            units_per_pack=it.units_per_pack,
            taxable=es_afecto,
        ))

        # La factura vende packs; el inventario cuenta unidades sueltas. Todo lo que
        # toca stock o costo unitario va en unidades, no en packs.
        inventory_qty = it.quantity * it.units_per_pack
        cost_per_unit = net_unit_cost / it.units_per_pack

        if it.product_id:
            product = db.query(Product).filter(Product.id == it.product_id).first()
            if not product:
                raise HTTPException(status_code=404, detail=f"Producto {it.product_id} no encontrado")
            # stock=None significa "este producto no lleva inventario" (café de
            # máquina, productos por receta). Sumarle stock lo convertiría en
            # controlado y el POS bloquearía su venta al llegar a 0. Para empezar
            # a llevarlo hay que darle un stock inicial en Productos.
            if product.stock is not None:
                product.stock += inventory_qty
            product.cost_price = cost_per_unit  # último costo neto de compra, por unidad

        elif it.ingredient_id:
            ingredient = db.query(Ingredient).filter(Ingredient.id == it.ingredient_id).first()
            if not ingredient:
                raise HTTPException(status_code=404, detail=f"Insumo {it.ingredient_id} no encontrado")
            ingredient.current_stock += inventory_qty
            ingredient.last_price = cost_per_unit
            db.add(IngredientMovement(
                ingredient_id=it.ingredient_id,
                type='purchase',
                quantity=inventory_qty,
                cost=line_total,
                seller_id=admin.id,
                expense_id=expense.id,
                notes=f"Compra (factura #{expense.id})",
            ))

    _learn_aliases(db, payload)

    db.commit()
    db.refresh(expense)
    log_action(db, ACTIONS.PURCHASE_CREATED, admin.id,
               f"Compra ${total:.0f} ({payload.document_type}) — {len(payload.items)} líneas en {category.name}")
    return _purchase_to_out(expense)


def _decode_scan_file(payload: InvoiceScanRequest):
    """Decodifica el base64 (con o sin prefijo data URI) y detecta el tipo real
    por magic bytes — no se confía en la extensión ni en el mime declarado."""
    b64 = payload.file_base64
    if "," in b64[:100] and b64.startswith("data:"):
        b64 = b64.split(",", 1)[1]
    try:
        data = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Archivo base64 inválido")

    if data.startswith(b"%PDF"):
        mime, max_mb = "application/pdf", 50
    elif data.startswith(b"\xff\xd8"):
        mime, max_mb = "image/jpeg", 10
    elif data.startswith(b"\x89PNG"):
        mime, max_mb = "image/png", 10
    elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        mime, max_mb = "image/webp", 10
    else:
        raise HTTPException(status_code=400, detail="Formato no soportado. Usa PDF, JPG, PNG o WEBP")
    if len(data) > max_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"Archivo demasiado grande (máx {max_mb}MB)")
    return data, mime


def _normalize_folio(folio):
    """El folio se compara sin espacios, guiones ni ceros a la izquierda: el mismo
    documento puede venir tipeado como '0104209861', '104209861' o '104-209-861'."""
    if not folio:
        return None
    limpio = re.sub(r"[^A-Za-z0-9]", "", str(folio)).upper().lstrip("0")
    return limpio or None


def _normalize_rut(rut):
    return re.sub(r"[.\s]", "", rut or "").upper().lstrip("0") or None


def _similarity(a, b):
    """Similitud entre descripción de factura y nombre de producto/insumo:
    lo mejor entre la razón de secuencia y el traslape de palabras (las facturas
    abrevian y reordenan: 'SOPROLE LECHE ENTERA MID UHT 12x1Lt' vs 'Leche Entera')."""
    a, b = a.lower(), b.lower()
    seq = SequenceMatcher(None, a, b).ratio()
    ta = {t for t in re.split(r"[^a-záéíóúñ0-9]+", a) if len(t) > 2}
    tb = {t for t in re.split(r"[^a-záéíóúñ0-9]+", b) if len(t) > 2}
    tokens = len(ta & tb) / min(len(ta), len(tb)) if ta and tb else 0.0
    return max(seq, tokens)


def _match_line(descripcion, products, ingredients, aliases):
    """Primero el alias confirmado por el admin (exacto, con su factor de pack);
    solo si no hay, se cae al fuzzy — que es el camino del ítem nuevo."""
    alias = aliases.get(normalize_description(descripcion))
    if alias:
        item = alias.product if alias.product_id else alias.ingredient
        # Un producto borrado o desactivado invalida el alias: mejor fuzzy que
        # autoasignar stock a algo que ya no se vende.
        if item is not None and item.active:
            return ScanMatch(
                tipo='product' if alias.product_id else 'ingredient',
                id=item.id, name=item.name, score=1.0, status='seguro',
                origen='alias', units_per_pack=alias.units_per_pack or 1.0,
            )

    mejor = ScanMatch()
    for tipo, items in (("product", products), ("ingredient", ingredients)):
        for item in items:
            score = _similarity(descripcion, item.name)
            if score > mejor.score:
                mejor = ScanMatch(tipo=tipo, id=item.id, name=item.name, score=round(score, 2),
                                  status='seguro' if score >= 0.85 else 'sugerencia' if score >= 0.55 else 'sin_match')
    if mejor.status == 'sin_match':
        return ScanMatch()
    return mejor


@router.post("/purchases/scan", response_model=InvoiceScanResponse)
def scan_invoice(
    payload: InvoiceScanRequest,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    if not invoice_ai.is_available():
        raise HTTPException(status_code=503, detail="Escaneo con IA no configurado (falta ZAI_API_KEY en .env)")
    data, mime = _decode_scan_file(payload)

    try:
        resultados, uso = invoice_ai.scan_document(data, mime)
    except invoice_ai.InvoiceAIError as e:
        raise HTTPException(status_code=502, detail=str(e))

    suppliers = db.query(Supplier).filter(Supplier.active == True).all()  # noqa: E712
    products = db.query(Product).filter(Product.active == True).all()  # noqa: E712
    ingredients = db.query(Ingredient).filter(Ingredient.active == True).all()  # noqa: E712
    ruts = {_normalize_rut(s.rut): s for s in suppliers if _normalize_rut(s.rut)}

    aliases_cache = {}

    def _aliases_de(supplier_id):
        """Alias del proveedor, indexados por descripción normalizada."""
        if supplier_id is None:
            return {}
        if supplier_id not in aliases_cache:
            filas = (
                db.query(SupplierItemAlias)
                .options(joinedload(SupplierItemAlias.product),
                         joinedload(SupplierItemAlias.ingredient))
                .filter(SupplierItemAlias.supplier_id == supplier_id)
                .all()
            )
            aliases_cache[supplier_id] = {a.normalized_description: a for a in filas}
        return aliases_cache[supplier_id]

    documentos = []
    for r in resultados:
        datos = r["datos"]
        supplier = ruts.get(_normalize_rut(datos.get("rut_proveedor")))
        aliases = _aliases_de(supplier.id if supplier else None)
        documentos.append(ScanDocumentOut(
            tipo_documento=datos.get("tipo_documento"),
            proveedor=datos.get("proveedor"),
            rut_proveedor=datos.get("rut_proveedor"),
            folio=datos.get("folio"),
            fecha=datos.get("fecha"),
            neto=datos.get("neto"),
            iva=datos.get("iva"),
            total=datos.get("total"),
            supplier_id=supplier.id if supplier else None,
            supplier_name=supplier.name if supplier else None,
            prices_include_tax=invoice_ai.inferir_precios_con_iva(datos),
            lineas=[
                ScanLineOut(
                    descripcion=l.get("descripcion") or "",
                    cantidad=l.get("cantidad"),
                    precio_unitario=l.get("precio_unitario"),
                    total_linea=l.get("total_linea"),
                    pack_sugerido=detect_pack(l.get("descripcion") or ""),
                    match=_match_line(l.get("descripcion") or "", products, ingredients, aliases),
                )
                for l in datos.get("lineas") or []
            ],
            cargos_extra=[
                ScanChargeOut(
                    concepto=c.get("concepto") or "Cargo",
                    monto=c.get("monto"),
                    afecto_iva=invoice_ai.cargo_afecto_iva(c.get("concepto")),
                )
                for c in datos.get("cargos_extra") or []
            ],
            observaciones=datos.get("observaciones"),
            avisos=r["avisos"],
            markdown=r["markdown"],
        ))

    # Los tokens quedan registrados para poder medir el costo real por escaneo:
    # el gasto escala con páginas y densidad de líneas, no con el peso del archivo.
    ocr, est = uso["ocr"], uso["estructuracion"]
    vlm = uso.get("vlm_fallback") or {}
    fallback_txt = (f", VLM fallback {vlm['prompt_tokens']} entrada / {vlm['completion_tokens']} salida"
                    if vlm.get("total_tokens") else "")
    log_action(db, ACTIONS.INVOICE_SCAN, admin.id,
               f"Escaneo IA: {len(documentos)} documento(s), "
               f"folios {[d.folio for d in documentos]} · "
               f"{uso['paginas']} pág · tokens OCR {ocr['total_tokens']}, "
               f"estructuración {est['prompt_tokens']} entrada / {est['completion_tokens']} salida"
               f"{fallback_txt}")
    return InvoiceScanResponse(documentos=documentos)


@router.get("/purchases", response_model=list[PurchaseOut])
def list_purchases(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    supplier_id: Optional[int] = None,
    limit: int = Query(100, ge=1, le=300),
    offset: int = 0,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    q = (
        db.query(Expense)
        .join(PurchaseItem, PurchaseItem.expense_id == Expense.id)
        .options(
            joinedload(Expense.category), joinedload(Expense.seller),
            joinedload(Expense.supplier),
            joinedload(Expense.purchase_items).joinedload(PurchaseItem.category),
        )
    )
    dt_from = parse_date_from(date_from)
    dt_to = parse_date_to(date_to)
    if dt_from:
        q = q.filter(Expense.created_at >= dt_from)
    if dt_to:
        q = q.filter(Expense.created_at <= dt_to)
    if supplier_id:
        q = q.filter(Expense.supplier_id == supplier_id)
    expenses = (
        q.distinct()
        .order_by(Expense.created_at.desc())
        .offset(offset).limit(limit).all()
    )
    return [_purchase_to_out(e) for e in expenses]


def _costo_anterior(db: Session, expense_id: int, *, product_id=None, ingredient_id=None):
    """Costo por unidad de la compra previa del ítem, ignorando la que se anula.
    None si no hay historial: en ese caso no tocamos el costo actual, porque
    pisarlo con un cero sería peor que dejar el dato viejo."""
    q = (
        db.query(PurchaseItem)
        .join(Expense, PurchaseItem.expense_id == Expense.id)
        .filter(PurchaseItem.expense_id != expense_id)
    )
    if product_id:
        q = q.filter(PurchaseItem.product_id == product_id)
    else:
        q = q.filter(PurchaseItem.ingredient_id == ingredient_id)

    previa = q.order_by(Expense.created_at.desc()).first()
    if not previa:
        return None
    return previa.unit_cost / (previa.units_per_pack or 1.0)


@router.delete("/purchases/{expense_id}", response_model=PurchaseDeleteResult)
def delete_purchase(
    expense_id: int,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    """Anula una compra y revierte lo que movió: stock, costos y movimientos de
    insumo. No existe edición en el lugar a propósito — recalcular un diff de
    líneas contra el stock actual es mucho más frágil que anular y volver a cargar."""
    expense = (
        db.query(Expense)
        .options(joinedload(Expense.purchase_items))
        .filter(Expense.id == expense_id)
        .first()
    )
    if not expense:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    if not expense.purchase_items:
        raise HTTPException(status_code=400, detail="Ese gasto no es una compra con detalle; bórralo desde Gastos")

    avisos = []
    productos_revertidos = 0
    insumos_revertidos = 0

    for it in expense.purchase_items:
        inventory_qty = it.quantity * (it.units_per_pack or 1.0)

        if it.product_id:
            product = db.query(Product).filter(Product.id == it.product_id).first()
            if not product:
                continue
            if product.stock is not None:
                nuevo = product.stock - inventory_qty
                if nuevo < 0:
                    # Parte de lo comprado ya se vendió: el faltante es real y no
                    # se puede deshacer, así que se avisa en vez de dejar negativo.
                    avisos.append(
                        f"{product.name}: se descontaron {product.stock:g} de {inventory_qty:g} unidades "
                        f"(el resto ya se había vendido)"
                    )
                    nuevo = 0
                product.stock = nuevo
            anterior = _costo_anterior(db, expense_id, product_id=it.product_id)
            if anterior is not None:
                product.cost_price = anterior
            else:
                avisos.append(f"{product.name}: no hay compra anterior, revisa su precio de costo a mano")
            productos_revertidos += 1

        elif it.ingredient_id:
            ingredient = db.query(Ingredient).filter(Ingredient.id == it.ingredient_id).first()
            if not ingredient:
                continue
            nuevo = (ingredient.current_stock or 0) - inventory_qty
            if nuevo < 0:
                avisos.append(
                    f"{ingredient.name}: se descontaron {ingredient.current_stock:g} de {inventory_qty:g} "
                    f"{ingredient.unit} (el resto ya se había consumido)"
                )
                nuevo = 0
            ingredient.current_stock = nuevo
            anterior = _costo_anterior(db, expense_id, ingredient_id=it.ingredient_id)
            if anterior is not None:
                ingredient.last_price = anterior
            else:
                avisos.append(f"{ingredient.name}: no hay compra anterior, revisa su último precio a mano")
            insumos_revertidos += 1

    movimientos = db.query(IngredientMovement).filter(
        IngredientMovement.expense_id == expense_id
    ).delete(synchronize_session=False)

    _unlink_cash_movement(db, expense)

    # Las equivalencias aprendidas NO se borran solas: pueden ser correctas aunque
    # la compra estuviera mal. Pero si la compra fue el error, conviene revisarlas.
    if expense.supplier_id:
        descripciones = {normalize_description(it.description) for it in expense.purchase_items}
        descripciones.discard("")
        if descripciones:
            aprendidas = db.query(SupplierItemAlias).filter(
                SupplierItemAlias.supplier_id == expense.supplier_id,
                SupplierItemAlias.normalized_description.in_(descripciones),
            ).count()
            if aprendidas:
                avisos.append(
                    f"Quedan {aprendidas} equivalencia(s) aprendidas de esta factura. "
                    f"Si el error fue el pack o el ítem, bórralas en «Equivalencias»."
                )

    total = expense.amount
    descripcion = expense.description or f"Compra #{expense_id}"
    db.delete(expense)  # purchase_items caen por cascade
    db.commit()

    log_action(db, ACTIONS.PURCHASE_DELETED, admin.id,
               f"Compra anulada #{expense_id} ${total:.0f} — {descripcion} "
               f"({productos_revertidos} producto(s), {insumos_revertidos} insumo(s) revertidos)")

    return PurchaseDeleteResult(
        productos_revertidos=productos_revertidos,
        insumos_revertidos=insumos_revertidos,
        movimientos_borrados=movimientos,
        avisos=avisos,
    )


@router.get("/purchases/aliases", response_model=list[SupplierItemAliasOut])
def list_aliases(
    supplier_id: Optional[int] = Query(None),
    q: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Equivalencias aprendidas del escaneo: qué descripción de factura corresponde
    a qué producto/insumo."""
    query = (
        db.query(SupplierItemAlias)
        .options(joinedload(SupplierItemAlias.supplier),
                 joinedload(SupplierItemAlias.product),
                 joinedload(SupplierItemAlias.ingredient))
    )
    if supplier_id:
        query = query.filter(SupplierItemAlias.supplier_id == supplier_id)
    if q:
        norm = normalize_description(q)
        if norm:
            query = query.filter(SupplierItemAlias.normalized_description.contains(norm))

    filas = query.order_by(SupplierItemAlias.updated_at.desc()).all()
    salida = []
    for a in filas:
        item = a.product if a.product_id else a.ingredient
        salida.append(SupplierItemAliasOut(
            id=a.id,
            supplier_id=a.supplier_id,
            supplier_name=a.supplier.name if a.supplier else None,
            raw_description=a.raw_description,
            tipo='product' if a.product_id else 'ingredient' if a.ingredient_id else None,
            item_id=item.id if item else None,
            item_name=item.name if item else None,
            item_active=bool(item.active) if item else False,
            units_per_pack=a.units_per_pack or 1.0,
            times_seen=a.times_seen or 1,
            updated_at=a.updated_at or datetime.now(),
        ))
    return salida


@router.delete("/purchases/aliases/{alias_id}", status_code=204)
def delete_alias(
    alias_id: int,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    """Borra una equivalencia mal aprendida. No toca las compras ya registradas:
    solo deja de autoasignarse en el próximo escaneo, que vuelve al fuzzy."""
    alias = db.query(SupplierItemAlias).filter(SupplierItemAlias.id == alias_id).first()
    if not alias:
        raise HTTPException(status_code=404, detail="Equivalencia no encontrada")

    descripcion = alias.raw_description
    db.delete(alias)
    db.commit()
    log_action(db, ACTIONS.ALIAS_DELETED, admin.id, f"Equivalencia borrada: {descripcion}")


@router.get("/purchases/cost-history", response_model=list[CostHistoryEntry])
def cost_history(
    product_id: Optional[int] = Query(None),
    ingredient_id: Optional[int] = Query(None),
    limit: int = Query(30, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    if not product_id and not ingredient_id:
        raise HTTPException(status_code=400, detail="Indica product_id o ingredient_id")

    q = (
        db.query(PurchaseItem)
        .join(Expense, PurchaseItem.expense_id == Expense.id)
        .options(joinedload(PurchaseItem.expense).joinedload(Expense.supplier))
    )
    if product_id:
        q = q.filter(PurchaseItem.product_id == product_id)
    else:
        q = q.filter(PurchaseItem.ingredient_id == ingredient_id)

    items = q.order_by(Expense.created_at.desc()).limit(limit).all()
    return [
        CostHistoryEntry(
            expense_id=it.expense_id,
            date=it.expense.created_at,
            supplier_name=it.expense.supplier.name if it.expense and it.expense.supplier else None,
            document_type=it.expense.document_type if it.expense else 'factura',
            # En unidades de inventario, no en packs: si no, una compra por pack
            # aparece como un salto de costo contra las compras por unidad.
            quantity=it.quantity * (it.units_per_pack or 1.0),
            unit_cost=it.unit_cost / (it.units_per_pack or 1.0),
        )
        for it in items
    ]
