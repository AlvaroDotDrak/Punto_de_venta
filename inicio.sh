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

# Compilar el frontend. dist/ no viaja en el repo (.gitignore), así que sin esto
# se sirve el bundle de la última compilación local — o ninguno en un clon nuevo.
# Para saltarlo: bash inicio.sh --sin-build
if [ "$1" != "--sin-build" ] && command -v npm &> /dev/null; then
    echo "Compilando frontend..."
    npm run build || { echo "Error: falló npm run build. Corre 'npm install'."; exit 1; }
fi

echo "Iniciando Punto de Venta en http://localhost:8000"
echo "Presiona Ctrl+C para detener"

# Abrir browser automáticamente (si hay interfaz gráfica)
if command -v xdg-open &> /dev/null; then
    (sleep 2 && xdg-open http://localhost:8000) &
elif command -v gnome-open &> /dev/null; then
    (sleep 2 && gnome-open http://localhost:8000) &
fi

uvicorn backend.main:app --host 0.0.0.0 --port 8000
