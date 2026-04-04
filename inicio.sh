#!/bin/bash
# Script de inicio del Punto de Venta
# Ejecutar: bash inicio.sh

cd "$(dirname "$0")"

# Verificar que Python esté instalado
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 no está instalado"
    exit 1
fi

# Instalar dependencias si no están
if [ ! -d ".venv" ]; then
    echo "Creando entorno virtual..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
else
    source .venv/bin/activate
fi

echo "Iniciando Punto de Venta en http://localhost:8000"
echo "Presiona Ctrl+C para detener"

# Abrir browser automáticamente (si hay interfaz gráfica)
if command -v xdg-open &> /dev/null; then
    sleep 1.5 && xdg-open http://localhost:8000 &
fi

uvicorn backend.main:app --host 0.0.0.0 --port 8000
