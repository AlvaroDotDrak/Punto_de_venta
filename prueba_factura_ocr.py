#!/usr/bin/env python3
"""
Prueba de extracción de facturas con GLM-OCR (modelo OCR dedicado de Z.AI) — Fase 0 del plan IA.

Pipeline de 2 pasos (GLM-OCR no acepta prompts, solo devuelve el documento en Markdown):
  1. POST /layout_parsing con glm-ocr  → Markdown fiel del documento ($0.03 por millón de tokens)
  2. El Markdown se estructura al mismo JSON de prueba_factura_ia.py con glm-4.6v-flash (gratis)

Uso:
    export ZAI_API_KEY="tu-key-de-z.ai"
    python prueba_factura_ocr.py foto_factura1.jpg foto_factura2.png ...

Acepta JPG / PNG (y PDF hasta 50MB, que el endpoint sí soporta a diferencia del VLM).
No guarda tu API key en ninguna parte: la lee del entorno cada vez.
"""

import json
import os
import sys

from prueba_factura_ia import API_URL, encode_image, parse_json_answer
import time
import urllib.error
import urllib.request

OCR_URL = "https://api.z.ai/api/paas/v4/layout_parsing"
OCR_MODEL = "glm-ocr"
# modelo del paso de estructuración (texto → JSON). Los flash gratis (4.6v/4.7)
# inventan totales y confunden los miles chilenos; glm-4.7 pagado (~$0.002/factura)
# fue el único que respetó las reglas en las pruebas del 19/07/2026
MODELO_ESTRUCTURA = os.environ.get("MODELO_ESTRUCTURA", "glm-4.7")

PROMPT_TEXTO = """Eres un digitador experto de documentos tributarios chilenos.
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


def _post(url, payload, api_key):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    })
    for intento in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")
            if e.code == 429 and intento < 3:
                espera = 25 * (intento + 1)
                print(f"   ⏳ Rate limit, reintento en {espera}s...")
                time.sleep(espera)
                continue
            raise RuntimeError(f"HTTP {e.code} de Z.AI: {detail}") from e


def _md_de(resp):
    md = resp.get("md_results")
    if isinstance(md, list):
        md = "\n\n".join(p for p in md if p)
    return (md or "").strip()


def _pdf_a_jpegs(path):
    """Convierte cada página del PDF a JPEG con pdftoppm (poppler). Subir un JPEG
    de ~200KB por página tarda ~4s contra ~50s de re-subir el PDF completo."""
    import subprocess
    import tempfile
    tmpdir = tempfile.mkdtemp(prefix="factura_ocr_")
    subprocess.run(
        ["pdftoppm", "-jpeg", "-r", "200", path, os.path.join(tmpdir, "pagina")],
        check=True, capture_output=True,
    )
    return sorted(
        os.path.join(tmpdir, f) for f in os.listdir(tmpdir) if f.endswith(".jpg")
    )


def ocr(api_key, path):
    """Devuelve (lista de markdown por página, usage). Un PDF de varias facturas
    escaneadas se procesa página por página para estructurar cada una por separado."""
    if path.lower().endswith(".pdf"):
        rutas = _pdf_a_jpegs(path)
    else:
        rutas = [path]

    paginas, tokens = [], 0
    for ruta in rutas:
        resp = _post(OCR_URL, {"model": OCR_MODEL, "file": encode_image(ruta)}, api_key)
        md = _md_de(resp)
        if not md:
            raise RuntimeError(f"GLM-OCR no devolvió texto de {ruta}: {json.dumps(resp)[:300]}")
        paginas.append(md)
        tokens += resp.get("usage", {}).get("total_tokens", 0) or 0
    return paginas, {"total_tokens": tokens}


def _sumas_de_subconjuntos(montos):
    """Todas las sumas posibles de subconjuntos de cargos (incluida 0). Una factura
    puede incluir algunos cargos en el neto (fletes) y otros solo en el total (IABA),
    así que se acepta cualquier combinación que haga calzar la aritmética."""
    sumas = {0.0}
    for m in montos[:12]:
        sumas |= {s + m for s in sumas}
    return sumas


def validar(datos):
    """Chequeos aritméticos con cargos extra: detectan mala lectura del OCR."""
    avisos = []
    neto, iva, total = datos.get("neto"), datos.get("iva"), datos.get("total")
    lineas = datos.get("lineas") or []
    cargos = [c.get("monto") or 0 for c in datos.get("cargos_extra") or []]
    sumas_cargos = _sumas_de_subconjuntos(cargos)
    tol = lambda x: max(abs(x) * 0.02, 10)

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
    return avisos


def _limpiar_nulls(valor):
    """Sin thinking, el modelo a veces emite el string "null" en vez de null JSON."""
    if isinstance(valor, dict):
        return {k: _limpiar_nulls(v) for k, v in valor.items()}
    if isinstance(valor, list):
        return [_limpiar_nulls(v) for v in valor]
    if isinstance(valor, str) and valor.strip().lower() in ("null", ""):
        return None
    return valor


def estructurar(api_key, markdown):
    resp = _post(API_URL, {
        "model": MODELO_ESTRUCTURA,
        "messages": [{
            "role": "user",
            "content": f"{PROMPT_TEXTO}\n\n--- DOCUMENTO ---\n\n{markdown}",
        }],
        "temperature": 0.1,
        "thinking": {"type": "disabled"},
    }, api_key)
    contenido = resp["choices"][0]["message"]["content"]
    return _limpiar_nulls(parse_json_answer(contenido)), resp.get("usage", {})


def main():
    api_key = os.environ.get("ZAI_API_KEY")
    if not api_key:
        sys.exit("Falta la API key. Corre:  export ZAI_API_KEY='tu-key'  y reintenta.")
    if len(sys.argv) < 2:
        sys.exit(f"Uso: python {sys.argv[0]} factura1.jpg [factura2.png ...]")

    ok, con_avisos, fallidas = 0, 0, 0
    for path in sys.argv[1:]:
        print(f"\n{'=' * 60}\n📄 {path}")
        try:
            paginas, uso_ocr = ocr(api_key, path)
        except Exception as e:
            print(f"❌ Falló el OCR: {e}")
            fallidas += 1
            continue
        print(f"   {len(paginas)} página(s), {uso_ocr.get('total_tokens', '?')} tokens de OCR")

        for num, markdown in enumerate(paginas, 1):
            print(f"\n--- Página {num}: Markdown de GLM-OCR ({len(markdown)} chars) ---")
            print(markdown)
            try:
                datos, uso_llm = estructurar(api_key, markdown)
            except Exception as e:
                print(f"❌ Falló la estructuración: {e}")
                fallidas += 1
                continue

            print(f"\n--- Página {num}: JSON estructurado ---")
            print(json.dumps(datos, indent=2, ensure_ascii=False))
            avisos = validar(datos)
            if avisos:
                con_avisos += 1
                print("\n⚠️  Revisar (los números no cuadran):")
                for a in avisos:
                    print(f"   - {a}")
            else:
                ok += 1
                print("\n✅ Aritmética cuadra (neto/IVA/total/líneas consistentes)")
            print(f"   Tokens estructuración: {uso_llm.get('prompt_tokens', '?')} entrada / "
                  f"{uso_llm.get('completion_tokens', '?')} salida")

    print(f"\n{'=' * 60}\nResumen: {ok} OK · {con_avisos} con avisos · {fallidas} fallidas")
    print("Compara contra prueba_factura_ia.py (VLM directo) y contra el papel real.")


if __name__ == "__main__":
    main()
