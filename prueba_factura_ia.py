#!/usr/bin/env python3
"""
Prueba de extracción de facturas con GLM-4.6V-Flash (gratis) — Fase 0 del plan IA.

Uso:
    export ZAI_API_KEY="tu-key-de-z.ai"
    python prueba_factura_ia.py foto_factura1.jpg foto_factura2.png ...

Acepta JPG / PNG / WEBP (fotos de celular o escaneos). PDF no: conviértelo a
imagen primero (ej: abrir el PDF y sacar screenshot, o `pdftoppm -png factura.pdf pagina`).

No guarda tu API key en ninguna parte: la lee del entorno cada vez.
"""

import base64
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request

API_URL = "https://api.z.ai/api/paas/v4/chat/completions"
MODEL = "glm-4.6v-flash"  # gratis, 1 request concurrente

PROMPT = """Eres un digitador experto de documentos tributarios chilenos.
Analiza la imagen (factura, boleta o guía de despacho chilena) y extrae los datos
en este JSON EXACTO, sin texto adicional antes ni después:

{
  "tipo_documento": "factura" | "boleta" | "guia_despacho" | "otro",
  "proveedor": "razón social del emisor o null",
  "rut_proveedor": "RUT del emisor con formato XX.XXX.XXX-X o null",
  "folio": "número del documento o null",
  "fecha": "YYYY-MM-DD o null",
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
  "observaciones": "cualquier duda o dato ilegible, o null"
}

Reglas:
- FORMATO NUMÉRICO CHILENO: en el documento el punto es separador de MILES y la
  coma es DECIMAL. "9.245,33" significa 9245.33 y "11.095" significa 11095.
  En el JSON entrega números estándar (punto decimal, sin separador de miles).
- Transcribe la fecha EXACTAMENTE como aparece en "FECHA EMISION" del documento,
  dígito por dígito. No la deduzcas de otros campos.
- Copia cada cifra dígito por dígito desde la imagen; verifica dos veces los
  subtotales de las líneas contra la columna correspondiente.
- Si el documento tiene cargos adicionales (fletes, IABA, impuestos a bebidas,
  depósito de envases, descuentos globales), NO los mezcles con neto/iva/total:
  usa los valores rotulados como NETO, IVA y TOTAL, y describe los cargos extra
  en observaciones.
- Si una zona del documento está cortada en la foto o ilegible, usa null en esos
  campos y dilo en observaciones.
- Montos en pesos chilenos. NO inventes datos: es preferible null a adivinar."""


def encode_image(path):
    mime = mimetypes.guess_type(path)[0]
    if mime not in ("image/jpeg", "image/png", "image/webp"):
        raise ValueError(f"Formato no soportado: {path} ({mime}). Usa JPG/PNG/WEBP.")
    with open(path, "rb") as f:
        data = base64.b64encode(f.read()).decode()
    return f"data:{mime};base64,{data}"


def call_api(api_key, image_data_uri):
    body = json.dumps({
        "model": MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": image_data_uri}},
                {"type": "text", "text": PROMPT},
            ],
        }],
        "temperature": 0.1,
    }).encode()
    req = urllib.request.Request(API_URL, data=body, headers={
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
                print(f"   ⏳ Rate limit del tier gratis, reintento en {espera}s...")
                time.sleep(espera)
                continue
            raise RuntimeError(f"HTTP {e.code} de Z.AI: {detail}") from e


def parse_json_answer(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("La respuesta no contiene JSON")
    return json.loads(text[start:end + 1])


def validar(datos):
    """Chequeos aritméticos: detectan mala lectura del OCR."""
    avisos = []
    neto, iva, total = datos.get("neto"), datos.get("iva"), datos.get("total")
    lineas = datos.get("lineas") or []

    suma = sum(l.get("total_linea") or 0 for l in lineas)
    if neto and suma and abs(suma - neto) > max(neto * 0.02, 10):
        # a veces las líneas vienen con IVA incluido y el neto no
        if not (total and abs(suma - total) <= max(total * 0.02, 10)):
            avisos.append(f"Suma de líneas ({suma:.0f}) no calza con neto ({neto:.0f}) ni total")
    if neto and iva and abs(iva - neto * 0.19) > max(neto * 0.19 * 0.03, 10):
        avisos.append(f"IVA ({iva:.0f}) no es ~19% del neto (esperado {neto * 0.19:.0f})")
    if neto and iva and total and abs((neto + iva) - total) > 10:
        avisos.append(f"neto + IVA ({neto + iva:.0f}) no calza con total ({total:.0f})")
    return avisos


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
            respuesta = call_api(api_key, encode_image(path))
            contenido = respuesta["choices"][0]["message"]["content"]
            datos = parse_json_answer(contenido)
        except Exception as e:
            print(f"❌ Falló: {e}")
            fallidas += 1
            continue

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

        uso = respuesta.get("usage", {})
        if uso:
            print(f"   Tokens: {uso.get('prompt_tokens', '?')} entrada / "
                  f"{uso.get('completion_tokens', '?')} salida")

    print(f"\n{'=' * 60}\nResumen: {ok} OK · {con_avisos} con avisos · {fallidas} fallidas")
    print("Compara cada JSON contra el papel real: RUT, folio, montos y líneas.")


if __name__ == "__main__":
    main()
