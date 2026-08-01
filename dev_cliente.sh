#!/bin/bash
# Levanta el POS contra la base de datos de un cliente, en Linux, para inspeccionar
# o preparar una entrega (cargar fotos, cerrar una caja, corregir datos).
#
#   bash dev_cliente.sh /ruta/a/la/carpeta/del/cliente [puerto] [--sin-build]
#
# Trabaja SIEMPRE sobre una copia en ./_clientes/<nombre>/ — el original no se toca.
# Volver a correrlo reutiliza esa copia; para empezar de cero, borra la carpeta.
set -e
cd "$(dirname "$0")"
PROYECTO="$(pwd)"

ORIGEN="${1:-}"
PUERTO="${2:-8010}"

if [ -z "$ORIGEN" ] || [ ! -d "$ORIGEN" ]; then
    echo "Uso: bash dev_cliente.sh /ruta/a/la/carpeta/del/cliente [puerto]"
    exit 1
fi
if [ ! -f "$ORIGEN/pasteleria.db" ]; then
    echo "Error: no hay pasteleria.db en $ORIGEN"
    exit 1
fi

NOMBRE="$(basename "$ORIGEN")"
TRABAJO="$PROYECTO/_clientes/$NOMBRE"

if [ ! -d "$TRABAJO" ]; then
    echo "Copiando la base de $NOMBRE a _clientes/$NOMBRE/ ..."
    mkdir -p "$TRABAJO"
    # Los tres archivos juntos: el -wal puede tener escrituras que el .db aún no.
    for f in pasteleria.db pasteleria.db-wal pasteleria.db-shm .env; do
        [ -f "$ORIGEN/$f" ] && cp "$ORIGEN/$f" "$TRABAJO/"
    done
    echo "Copia creada. El original queda intacto."
else
    echo "Reusando la copia existente en _clientes/$NOMBRE/"
fi

if [ ! -f "$TRABAJO/.env" ]; then
    echo "Error: el cliente no tiene .env. Sin su PIN_SALT no vas a poder entrar."
    exit 1
fi

# Si el puerto está tomado, uvicorn falla al bindear PERO el navegador sigue
# hablando con el proceso viejo: los cambios "no aparecen" y no hay ningún error
# visible. Mejor cortar acá con un mensaje claro.
if (exec 3<>/dev/tcp/127.0.0.1/"$PUERTO") 2>/dev/null; then
    exec 3<&- 2>/dev/null
    echo "Error: el puerto $PUERTO ya está en uso — probablemente un servidor viejo."
    echo "Detenelo con:  pkill -f \"port $PUERTO\"     (o usa otro puerto)"
    exit 1
fi

[ -d .venv ] || { echo "Falta .venv. Corre inicio.sh primero."; exit 1; }
source .venv/bin/activate

# El .env del cliente DEBE ganar: load_dotenv() de main.py busca hacia arriba desde
# backend/ y encontraría el .env del proyecto, con otro PIN_SALT — y entonces
# ningún PIN de los vendedores del cliente validaría. Como load_dotenv no pisa
# variables ya definidas, exportarlas acá resuelve el conflicto.
#
# Se parsea con dotenv, NO con `source`: los .env que vuelven de una instalación
# Windows traen CRLF y `source` mete el \r dentro del valor. Un PIN_SALT con un
# byte de más hashea distinto y ningún PIN valida — con el agravante de que el
# error se ve como "PIN incorrecto", que manda a buscar el problema a otro lado.
eval "$(python -c "
import shlex
from dotenv import dotenv_values
for k, v in dotenv_values('$TRABAJO/.env').items():
    if v is not None:
        print(f'export {k}={shlex.quote(v)}')
")"

# dist/ se resuelve relativo a backend/main.py, no al cwd, así que basta con que
# esté compilado en el proyecto. Se recompila SIEMPRE: con "solo si no existe"
# quedaba servido el bundle viejo y los cambios de pantalla no aparecían.
if [ "${3:-}" != "--sin-build" ]; then
    echo "Compilando frontend..."
    npm run build || { echo "Error: falló npm run build. Corre 'npm install'."; exit 1; }
fi

# Sin esto, load_dotenv() completaría desde el .env del proyecto y verías
# funciones que el cliente no tiene contratadas (ej. el escaneo con IA).
grep -q '^ZAI_API_KEY=.' "$TRABAJO/.env" 2>/dev/null || unset ZAI_API_KEY

echo
echo "Base:   $TRABAJO/pasteleria.db"
echo "PINs:   los del cliente (usando su PIN_SALT)"
echo "Abrir:  http://localhost:$PUERTO"
echo "Ctrl+C para detener."
echo

cd "$TRABAJO"
PYTHONPATH="$PROYECTO" python -m uvicorn backend.main:app --host 127.0.0.1 --port "$PUERTO"
