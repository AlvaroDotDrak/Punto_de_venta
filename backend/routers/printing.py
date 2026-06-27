"""
Impresión de boletas en impresora térmica (ESC/POS, 80mm).

Manda los bytes RAW al spooler de Windows vía pywin32. Si pywin32 no está
disponible (ej. servidor Linux), los endpoints devuelven 503 sin tumbar la app.
"""
import base64
import io
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Sale, SystemConfig
from ..auth import get_current_seller, require_admin

try:
    import win32print
    _PRINT_AVAILABLE = True
except ImportError:
    _PRINT_AVAILABLE = False

try:
    from PIL import Image
    _IMG_AVAILABLE = True
except ImportError:
    _IMG_AVAILABLE = False

router = APIRouter(prefix="/print", tags=["printing"])

LINE_WIDTH = 48  # columnas de una térmica de 80mm con Font A

# ── Comandos ESC/POS ─────────────────────────────────────────────────────────
_INIT = b"\x1b@"
# Las POS-80 clónicas arrancan en modo de caracteres chinos (multibyte): un byte
# alto como el de "¡" se combina con el siguiente y sale un glifo chino. FS . lo
# cancela; ESC t 2 selecciona CP850 (Latin-1), que sí trae ¡ ¿ ñ y vocales
# acentuadas en mayúscula (CP437 no tiene la Í, salía "?").
_CANCEL_KANJI = b"\x1c\x2e"
_CHARSET = b"\x1b\x74\x02"
_CENTER = b"\x1b\x61\x01"
_LEFT = b"\x1b\x61\x00"
_BOLD_ON = b"\x1bE\x01"
_BOLD_OFF = b"\x1bE\x00"
_BIG_ON = b"\x1d\x21\x11"   # doble alto y ancho
_BIG_OFF = b"\x1d\x21\x00"
_TALL_ON = b"\x1b!\x18"     # negrita + doble alto (no cambia el ancho en columnas)
_TALL_OFF = b"\x1b!\x00"
_LINESPACING = b"\x1b\x33\x28"  # ESC 3 40: interlineado más holgado (menos compacto)
_FEED_CUT = b"\x1bd\x09\x1dV\x01"  # avanzar 9 líneas + corte parcial (deja espacio bajo el cabezal)

_SEP = "=" * LINE_WIDTH
_SUB = "-" * LINE_WIDTH

LOGO_WIDTH = 384  # ancho objetivo del logo en puntos (de 576 máx en 80mm)


class PrintReceiptRequest(BaseModel):
    sale_id: int
    cash_received: float | None = None


def _money(n) -> str:
    return "$" + f"{int(round(n or 0)):,}".replace(",", ".")


def _row(left: str, right: str) -> str:
    spaces = LINE_WIDTH - len(left) - len(right)
    return left + " " * max(1, spaces) + right


def _txt(s: str) -> bytes:
    return s.encode("cp850", "replace")


def _printer_name(db: Session) -> str:
    item = db.query(SystemConfig).filter(SystemConfig.key == "printer_name").first()
    return (item.value if item and item.value else "POS-80")


def _branding(db: Session) -> dict:
    item = db.query(SystemConfig).filter(SystemConfig.key == "branding").first()
    if not item:
        return {}
    try:
        return json.loads(item.value)
    except (ValueError, TypeError):
        return {}


def _flag(db: Session, key: str) -> bool:
    item = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    return bool(item and item.value == "true")


def _logo_raster(db: Session, max_width: int = LOGO_WIDTH) -> bytes:
    """Convierte el logo (branding.logo, base64) a una imagen raster ESC/POS (GS v 0).

    Devuelve b"" si no hay logo, falta Pillow, o algo falla — nunca rompe la impresión.
    """
    if not _IMG_AVAILABLE:
        return b""
    logo = _branding(db).get("logo")
    if not logo:
        return b""
    try:
        if "," in logo:  # data URL: "data:image/png;base64,...."
            logo = logo.split(",", 1)[1]
        img = Image.open(io.BytesIO(base64.b64decode(logo))).convert("L")
        w, h = img.size
        target_w = max(8, (min(max_width, w) // 8) * 8)  # múltiplo de 8
        if target_w != w:
            img = img.resize((target_w, max(1, round(h * target_w / w))))
        img = img.convert("1")  # 1 bit con dithering (Floyd-Steinberg)
        w, h = img.size
        bytes_per_row = w // 8
        px = img.load()
        data = bytearray()
        for y in range(h):
            for bx in range(bytes_per_row):
                byte = 0
                for bit in range(8):
                    if px[bx * 8 + bit, y] == 0:  # 0 = negro
                        byte |= 0x80 >> bit
                data.append(byte)
        header = bytes([
            bytes_per_row & 0xFF, (bytes_per_row >> 8) & 0xFF,
            h & 0xFF, (h >> 8) & 0xFF,
        ])
        return b"\x1d\x76\x30\x00" + header + bytes(data)
    except Exception:
        return b""


def _print_raw(printer_name: str, data: bytes) -> None:
    if not _PRINT_AVAILABLE:
        raise HTTPException(503, "Impresión no disponible en este servidor (falta pywin32)")
    try:
        h = win32print.OpenPrinter(printer_name)
    except Exception as e:
        raise HTTPException(400, f"No se pudo abrir la impresora '{printer_name}': {e}")
    try:
        win32print.StartDocPrinter(h, 1, ("Boleta POS", None, "RAW"))
        win32print.StartPagePrinter(h)
        win32print.WritePrinter(h, bytes(data))
        win32print.EndPagePrinter(h)
        win32print.EndDocPrinter(h)
    finally:
        win32print.ClosePrinter(h)


def _build_receipt(db: Session, sale: Sale, cash_received: float | None) -> bytes:
    branding = _branding(db)
    name = branding.get("name") or "Punto de Venta"
    tagline = branding.get("tagline") or ""
    address = branding.get("address") or ""
    phone = branding.get("phone") or ""
    rut = branding.get("rut") or ""
    footer = branding.get("receipt_footer") or "¡Gracias por su compra!"
    fecha = (sale.created_at or datetime.now()).strftime("%d/%m/%Y %H:%M")
    pago = (sale.payment_method or "efectivo").capitalize()
    seller_name = sale.seller.name if sale.seller else "Sistema"
    n_items = sum(it.quantity for it in sale.items)

    buf = bytearray()
    buf += _INIT + _CANCEL_KANJI + _CHARSET + _LINESPACING

    # ── Logo (opcional) ──
    if _flag(db, "print_logo"):
        logo = _logo_raster(db)
        if logo:
            buf += _CENTER + logo + b"\n"

    # ── Encabezado (centrado) ──
    buf += _CENTER
    buf += _BIG_ON + _BOLD_ON + _txt(name) + b"\n" + _BIG_OFF + _BOLD_OFF
    if tagline:
        buf += _txt(tagline) + b"\n"
    if address:
        buf += _txt(address) + b"\n"
    if phone:
        buf += _txt(f"Tel: {phone}") + b"\n"
    if rut:
        buf += _txt(f"RUT: {rut}") + b"\n"
    buf += b"\n"

    # ── Datos de la venta ──
    buf += _LEFT + _txt(_SEP) + b"\n"
    buf += _txt(_row(f"Doc #{sale.id:06d}", fecha)) + b"\n"
    buf += _txt(_row(f"Vendedor: {seller_name}", f"Pago: {pago}")) + b"\n"
    buf += b"\n"

    # ── Cabecera de columnas + ítems ──
    buf += _BOLD_ON + _txt(_row("CANT  DESCRIPCION", "TOTAL")) + b"\n" + _BOLD_OFF
    buf += _txt(_SUB) + b"\n"
    for it in sale.items:
        nombre = it.product_name[: LINE_WIDTH - 6]
        buf += _txt(f"{it.quantity:<4}  {nombre}") + b"\n"
        buf += _txt(_row(f"      {_money(it.price)} c/u", _money(it.subtotal))) + b"\n"

    buf += _txt(_SUB) + b"\n"
    buf += _txt(_row("Articulos:", str(n_items))) + b"\n"
    buf += b"\n"

    # ── Total (negrita + doble alto) ──
    buf += _TALL_ON + _txt(_row("TOTAL", _money(sale.total))) + b"\n" + _TALL_OFF

    if sale.payment_method == "efectivo" and cash_received:
        buf += _txt(_row("Recibido", _money(cash_received))) + b"\n"
        buf += _txt(_row("Vuelto", _money(cash_received - sale.total))) + b"\n"

    buf += b"\n" + _txt(_SEP) + b"\n\n"

    # ── Pie (centrado) ──
    buf += _CENTER
    if sale.has_receipt:
        buf += _BOLD_ON + _txt("*** BOLETA ***") + b"\n" + _BOLD_OFF
    buf += _txt(footer) + b"\n"
    buf += _FEED_CUT
    return bytes(buf)


def _build_test(db: Session) -> bytes:
    branding = _branding(db)
    name = branding.get("name") or "Punto de Venta"
    buf = bytearray()
    buf += _INIT + _CANCEL_KANJI + _CHARSET + _LINESPACING
    if _flag(db, "print_logo"):
        logo = _logo_raster(db)
        if logo:
            buf += _CENTER + logo + b"\n"
    buf += _CENTER + _BIG_ON + _BOLD_ON + _txt(name) + b"\n" + _BIG_OFF + _BOLD_OFF
    buf += _txt("-" * LINE_WIDTH) + b"\n"
    buf += _txt("PRUEBA DE IMPRESORA") + b"\n"
    buf += _LEFT + _txt(f"Fecha: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}") + b"\n"
    buf += _txt(f"Impresora: {_printer_name(db)}") + b"\n"
    buf += _txt("-" * LINE_WIDTH) + b"\n"
    buf += _CENTER + _txt("Si lees esto, la termica") + b"\n"
    buf += _txt("imprime correctamente!") + b"\n"
    buf += _FEED_CUT
    return bytes(buf)


@router.post("/receipt")
def print_receipt(
    payload: PrintReceiptRequest,
    db: Session = Depends(get_db),
    _=Depends(get_current_seller),
):
    sale = db.query(Sale).filter(Sale.id == payload.sale_id).first()
    if not sale:
        raise HTTPException(404, "Venta no encontrada")
    _print_raw(_printer_name(db), _build_receipt(db, sale, payload.cash_received))
    return {"ok": True}


@router.post("/test")
def print_test(db: Session = Depends(get_db), _=Depends(require_admin)):
    _print_raw(_printer_name(db), _build_test(db))
    return {"ok": True}
