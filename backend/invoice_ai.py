"""Extracción de datos de facturas con IA (Z.AI).

Pipeline de 2 pasos validado en la fase de prueba (prueba_factura_ocr.py, 19/07/2026):
  1. glm-ocr (endpoint layout_parsing) transcribe cada página a Markdown.
  2. glm-4.7 estructura el Markdown al JSON del documento tributario chileno.
     Los modelos flash gratis inventan totales y confunden los miles chilenos.

Requiere ZAI_API_KEY en el entorno (.env). Sin la key el módulo queda no disponible
y el endpoint responde 503, igual que printing.py sin pywin32.
"""

import base64
import io
import json
import os
import re
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

OCR_URL = "https://api.z.ai/api/paas/v4/layout_parsing"
CHAT_URL = "https://api.z.ai/api/paas/v4/chat/completions"
OCR_MODEL = "glm-ocr"
STRUCT_MODEL = os.environ.get("ZAI_STRUCT_MODEL", "glm-4.7")
# VLM pagado para el fallback: el OCR a veces clasifica el recuadro de totales como
# imagen y no lo transcribe; el VLM 've' la hoja completa y recupera esos números.
# Los modelos -flash gratis inventan totales y rompen los miles chilenos: no usarlos.
VLM_MODEL = os.environ.get("ZAI_VLM_MODEL", "glm-4.6v")

MAX_PAGES = 30
_WORKERS = 4


class InvoiceAIError(Exception):
    """Error del pipeline con mensaje apto para mostrar al usuario."""


def is_available():
    return bool(os.environ.get("ZAI_API_KEY"))


PROMPT = """Eres un digitador experto de documentos tributarios chilenos.
Analiza el siguiente documento (factura, boleta o guía de despacho chilena),
transcrito a Markdown por un OCR, y extrae los datos en este JSON EXACTO, sin
texto adicional antes ni después:

{
  "tipo_documento": "factura" | "boleta" | "guia_despacho" | "otro",
  "proveedor": "razón social del emisor o null",
  "rut_proveedor": "RUT del emisor con formato XX.XXX.XXX-X o null",
  "folio": "número del documento, como string, o null",
  "fecha": "fecha de EMISION en formato YYYY-MM-DD o null",
  "neto": número o null,
  "iva": número o null,
  "total": número o null,
  "lineas": [
    {
      "descripcion": "texto del item",
      "cantidad": número,
      "precio_unitario": número o null,
      "total_linea": número o null
    }
  ],
  "cargos_extra": [
    {"concepto": "rótulo tal como aparece (FLETE, I.A.B.A. 18%, RECARGO 12%, DEPOSITO ENVASES, DESCUENTO...)", "monto": número}
  ],
  "observaciones": "cualquier duda o dato ilegible, o null"
}

Reglas:
- FORMATO NUMÉRICO CHILENO: el punto es separador de MILES y la coma es DECIMAL.
  "11.095" = 11095 y "9.245,33" = 9245.33. Un número con punto seguido de
  exactamente 3 dígitos es SIEMPRE miles: "1.720" = 1720. Algunos documentos usan
  el formato inverso (coma de miles, punto decimal): "9,245.33" = 9245.33. Decide
  por la magnitud razonable de un precio en pesos chilenos. En el JSON entrega
  números estándar (punto decimal, sin separador de miles).
- neto, iva y total SOLO pueden venir de valores rotulados en el documento (NETO,
  I.V.A., TOTAL, Sub Total, Monto Total...). Si el bloque de totales no aparece en
  el texto, usa null y dilo en observaciones. NUNCA los calcules tú sumando líneas.
- cargos_extra: TODO cargo o descuento global que no sea línea de producto ni
  NETO/IVA/TOTAL: fletes, impuestos adicionales (I.A.B.A., ILA), recargos
  porcentuales, depósito de envases, descuentos globales (monto negativo).
  Copia el rótulo textual y NO los mezcles con neto/iva/total ni con las líneas.
- La fecha de emisión SIEMPRE en YYYY-MM-DD ("13 de julio de 2025" → "2025-07-13",
  "16/07/2026" → "2026-07-16"). No confundas con fechas de resolución del SII ni
  de vencimiento. El folio siempre como string.
- Copia cada cifra dígito por dígito; verifica los subtotales de las líneas contra
  la columna correspondiente.
- Montos en pesos chilenos. NO inventes datos: es preferible null a adivinar."""


def _post(url, payload, timeout=150):
    api_key = os.environ.get("ZAI_API_KEY")
    if not api_key:
        raise InvoiceAIError("Escaneo con IA no configurado (falta ZAI_API_KEY en .env)")
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    })
    for intento in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:300]
            if e.code == 429 and intento < 2:
                time.sleep(10 * (intento + 1))
                continue
            raise InvoiceAIError(f"Z.AI respondió HTTP {e.code}: {detail}")
        except (urllib.error.URLError, TimeoutError) as e:
            raise InvoiceAIError(f"No se pudo contactar a Z.AI: {e}")


def _pdf_to_jpegs(data):
    try:
        import pypdfium2 as pdfium
    except ImportError:
        raise InvoiceAIError("Falta la librería pypdfium2 para escanear PDFs (pip install pypdfium2)")
    pdf = pdfium.PdfDocument(data)
    try:
        if len(pdf) > MAX_PAGES:
            raise InvoiceAIError(f"El PDF tiene {len(pdf)} páginas; el máximo es {MAX_PAGES}")
        jpegs = []
        for page in pdf:
            # scale 2.8 ≈ 200 DPI: suficiente para OCR sin inflar la subida
            pil = page.render(scale=2.8).to_pil()
            buf = io.BytesIO()
            pil.convert("RGB").save(buf, format="JPEG", quality=85)
            jpegs.append(buf.getvalue())
        return jpegs
    finally:
        pdf.close()


def _ocr_page(jpeg_bytes, mime="image/jpeg"):
    """Devuelve (markdown, usage) — el usage se acumula para poder medir el costo real."""
    data_uri = f"data:{mime};base64," + base64.b64encode(jpeg_bytes).decode()
    resp = _post(OCR_URL, {"model": OCR_MODEL, "file": data_uri})
    md = resp.get("md_results")
    if isinstance(md, list):
        md = "\n\n".join(p for p in md if p)
    md = (md or "").strip()
    if not md:
        raise InvoiceAIError("El OCR no pudo leer la página (¿imagen ilegible?)")
    return md, resp.get("usage") or {}


def _limpiar_nulls(valor):
    """El modelo a veces emite el string "null" en vez de null JSON."""
    if isinstance(valor, dict):
        return {k: _limpiar_nulls(v) for k, v in valor.items()}
    if isinstance(valor, list):
        return [_limpiar_nulls(v) for v in valor]
    if isinstance(valor, str) and valor.strip().lower() in ("null", ""):
        return None
    return valor


def _parse_json(text):
    text = text.strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise InvoiceAIError("El modelo no devolvió un JSON válido")
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError as e:
        raise InvoiceAIError(f"JSON malformado del modelo: {e}")


def _normalizar(datos):
    """Post-proceso defensivo: folio como string, fecha ISO si es posible."""
    if datos.get("folio") is not None:
        datos["folio"] = str(datos["folio"])
    fecha = datos.get("fecha")
    if fecha and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(fecha)):
        m = re.fullmatch(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", str(fecha).strip())
        datos["fecha"] = f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}" if m else None
    return datos


def _estructurar(markdown):
    resp = _post(CHAT_URL, {
        "model": STRUCT_MODEL,
        "messages": [{"role": "user", "content": f"{PROMPT}\n\n--- DOCUMENTO ---\n\n{markdown}"}],
        "temperature": 0.1,
        "thinking": {"type": "disabled"},
    })
    contenido = resp["choices"][0]["message"]["content"]
    return _normalizar(_limpiar_nulls(_parse_json(contenido))), resp.get("usage") or {}


def _estructurar_vlm(jpeg_bytes, mime="image/jpeg"):
    """Fallback: estructura desde la imagen directa en vez del Markdown del OCR.
    El VLM lee los recuadros que el OCR descarta como imagen. Devuelve (datos, usage)."""
    data_uri = f"data:{mime};base64," + base64.b64encode(jpeg_bytes).decode()
    resp = _post(CHAT_URL, {
        "model": VLM_MODEL,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": PROMPT},
            {"type": "image_url", "image_url": {"url": data_uri}},
        ]}],
        "temperature": 0.1,
    })
    contenido = resp["choices"][0]["message"]["content"]
    return _normalizar(_limpiar_nulls(_parse_json(contenido))), resp.get("usage") or {}


def _rellenar_totales_vlm(datos, jpeg_bytes, mime, usos_out):
    """Cuando faltan totales (el OCR botó el recuadro), pide neto/IVA/total al VLM
    directo y los adopta SOLO si la aritmética del documento cierra con las líneas
    que ya leyó el OCR. Nunca degrada: ante error o incoherencia deja los null y el
    aviso del validador. Modifica `datos` in-place y acumula el usage en `usos_out`."""
    try:
        vlm, uso = _estructurar_vlm(jpeg_bytes, mime)
    except InvoiceAIError:
        return
    usos_out.append(uso)
    candidato = dict(datos)
    for campo in ("neto", "iva", "total"):
        if candidato.get(campo) is None and vlm.get(campo) is not None:
            candidato[campo] = vlm[campo]
    if candidato.get("neto") is None or candidato.get("total") is None:
        return  # el VLM tampoco trajo los totales
    if validar(candidato):
        return  # los totales del VLM no reconcilian con las líneas: no confiar
    datos.update({k: candidato[k] for k in ("neto", "iva", "total")})


def _sumas_de_subconjuntos(montos):
    """Todas las sumas posibles de subconjuntos de cargos (incluida 0). Una factura
    puede incluir algunos cargos en el neto (fletes) y otros solo en el total (IABA),
    así que se acepta cualquier combinación que haga calzar la aritmética."""
    sumas = {0.0}
    for m in montos[:12]:
        sumas |= {s + m for s in sumas}
    return sumas


def validar(datos):
    """Chequeos aritméticos: los avisos van a revisión humana, no bloquean."""
    avisos = []
    neto, iva, total = datos.get("neto"), datos.get("iva"), datos.get("total")
    lineas = datos.get("lineas") or []
    cargos = [c.get("monto") or 0 for c in datos.get("cargos_extra") or []]
    sumas_cargos = _sumas_de_subconjuntos(cargos)
    tol = lambda x: max(abs(x) * 0.02, 10)

    # Sin totales rotulados los chequeos aritméticos no disparan y el resultado se
    # vería como verificado; avisar explícitamente (el OCR a veces bota el recuadro).
    if lineas and neto is None:
        avisos.append("No se detectó el NETO del documento — verifícalo contra el papel")
    if lineas and total is None:
        avisos.append("No se detectó el TOTAL del documento — verifícalo contra el papel")

    suma = sum(l.get("total_linea") or 0 for l in lineas)
    if neto and suma:
        calza_neto = any(abs(suma + s - neto) <= tol(neto) for s in sumas_cargos)
        # a veces las líneas vienen con IVA incluido y calzan contra el total
        calza_total = total and abs(suma - total) <= tol(total)
        if not calza_neto and not calza_total:
            avisos.append(f"Suma de líneas ({suma:.0f}) + cargos no calza con neto ({neto:.0f}) ni total")
    if neto and iva and abs(iva - neto * 0.19) > max(neto * 0.19 * 0.03, 10):
        avisos.append(f"IVA ({iva:.0f}) no es ~19% del neto (esperado {neto * 0.19:.0f})")
    if neto and iva and total:
        if not any(abs(neto + iva + s - total) <= tol(total) for s in sumas_cargos):
            avisos.append(f"neto + IVA + cargos no llega al total ({total:.0f})")
    if not lineas:
        avisos.append("No se detectaron líneas de detalle")
    return avisos


def cargo_afecto_iva(concepto):
    """False si el cargo es un impuesto adicional que NO lleva IVA (IABA, ILA,
    impuesto a la carne, 'impuesto adicional'). Los fletes y recargos comerciales
    sí son afectos. Estos impuestos específicos suman al total sin base imponible."""
    if not concepto:
        return True
    c = concepto.lower()
    for marca in ("iaba", "i.a.b.a", "ila", "i.l.a", "impuesto adicional",
                  "imp. adicional", "afecto adicional", "adicional", "carne"):
        if marca in c:
            return False
    return True


def inferir_precios_con_iva(datos):
    """True si los totales de línea parecen venir con IVA incluido (calzan con el
    total y no con el neto), False si calzan con el neto, None si no hay evidencia."""
    neto, total = datos.get("neto"), datos.get("total")
    suma = sum(l.get("total_linea") or 0 for l in datos.get("lineas") or [])
    if not suma:
        return None
    cargos = [c.get("monto") or 0 for c in datos.get("cargos_extra") or []]
    sumas_cargos = _sumas_de_subconjuntos(cargos)
    tol = lambda x: max(abs(x) * 0.02, 10)
    if neto and any(abs(suma + s - neto) <= tol(neto) for s in sumas_cargos):
        return False
    if total and abs(suma - total) <= tol(total):
        return True
    return None


def _sumar_uso(usos):
    """Acumula los usage de varias llamadas. Las respuestas no siempre traen todos
    los campos, así que se suma lo que haya."""
    total = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    for u in usos:
        for k in total:
            total[k] += u.get(k) or 0
    return total


def scan_document(data, mime):
    """Procesa un documento (imagen o PDF multipágina) y devuelve
    (resultados, uso), donde resultados es una lista de dicts por página
    {"datos": ..., "avisos": [...], "markdown": "..."} y uso son los tokens
    consumidos, para poder medir el costo real de cada escaneo."""
    if mime == "application/pdf":
        paginas = _pdf_to_jpegs(data)
        mimes = ["image/jpeg"] * len(paginas)
    elif mime in ("image/jpeg", "image/png", "image/webp"):
        paginas, mimes = [data], [mime]
    else:
        raise InvoiceAIError(f"Formato no soportado: {mime}. Usa PDF, JPG, PNG o WEBP")

    with ThreadPoolExecutor(max_workers=_WORKERS) as pool:
        ocr = list(pool.map(_ocr_page, paginas, mimes))
        markdowns = [md for md, _ in ocr]
        estructurado = list(pool.map(_estructurar, markdowns))

    datos_por_pagina = [d for d, _ in estructurado]

    # Fallback: las páginas con líneas pero sin totales suelen ser recuadros que el
    # OCR botó como imagen; el VLM los recupera (y solo se adoptan si la cuenta cierra).
    # El VLM es lento (~40s) y variable, así que las páginas pendientes van en paralelo.
    usos_vlm = []
    pendientes = [i for i, datos in enumerate(datos_por_pagina)
                  if datos.get("lineas") and
                  (datos.get("neto") is None or datos.get("total") is None)]
    if pendientes:
        with ThreadPoolExecutor(max_workers=_WORKERS) as pool:
            list(pool.map(
                lambda i: _rellenar_totales_vlm(datos_por_pagina[i], paginas[i], mimes[i], usos_vlm),
                pendientes))

    uso = {
        "paginas": len(paginas),
        "ocr": _sumar_uso(u for _, u in ocr),
        "estructuracion": _sumar_uso(u for _, u in estructurado),
        "vlm_fallback": _sumar_uso(usos_vlm),
    }

    resultados = [
        {"datos": datos, "avisos": validar(datos), "markdown": md}
        for datos, md in zip(datos_por_pagina, markdowns)
    ]
    return resultados, uso
