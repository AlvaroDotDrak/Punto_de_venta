# Levanta el POS contra la base de datos de un cliente, en Windows, para inspeccionar
# o preparar una entrega (revisar una caja, corregir datos, probar una versión nueva).
#
#   .\dev_cliente.ps1 C:\ruta\a\la\carpeta\del\cliente [-Puerto 8010] [-SinBuild]
#
# Equivalente de dev_cliente.sh. Sirve para probar cambios sin compilar el .exe —
# útil cuando Smart App Control bloquea ejecutables sin firmar.
#
# Trabaja SIEMPRE sobre una copia en .\_clientes\<nombre>\ — el original no se toca.
# Volver a correrlo reutiliza esa copia; para empezar de cero, borrá la carpeta.
param(
    [Parameter(Mandatory = $true)][string]$Origen,
    [int]$Puerto = 8010,
    [switch]$SinBuild
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$proyecto = $PSScriptRoot

if (-not (Test-Path $Origen -PathType Container)) {
    Write-Host "Error: no existe la carpeta $Origen" -ForegroundColor Red; exit 1
}
if (-not (Test-Path (Join-Path $Origen "pasteleria.db"))) {
    Write-Host "Error: no hay pasteleria.db en $Origen" -ForegroundColor Red; exit 1
}

$nombre = Split-Path $Origen -Leaf
$trabajo = Join-Path $proyecto "_clientes\$nombre"

if (-not (Test-Path $trabajo)) {
    Write-Host "Copiando la base de $nombre a _clientes\$nombre\ ..."
    New-Item -ItemType Directory -Force $trabajo | Out-Null
    # Los tres archivos juntos: el -wal puede tener escrituras que el .db aún no.
    foreach ($f in @("pasteleria.db", "pasteleria.db-wal", "pasteleria.db-shm", ".env")) {
        $src = Join-Path $Origen $f
        if (Test-Path $src) { Copy-Item $src $trabajo }
    }
    Write-Host "Copia creada. El original queda intacto." -ForegroundColor Green
} else {
    Write-Host "Reusando la copia existente en _clientes\$nombre\"
}

if (-not (Test-Path (Join-Path $trabajo ".env"))) {
    Write-Host "Error: el cliente no tiene .env. Sin su PIN_SALT no vas a poder entrar." -ForegroundColor Red
    exit 1
}

# Si el puerto está tomado, uvicorn falla al bindear PERO el navegador sigue hablando
# con el proceso viejo: los cambios "no aparecen" y no hay ningún error visible.
$ocupado = Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue
if ($ocupado) {
    $pid_ = $ocupado.OwningProcess | Select-Object -First 1
    $proc = Get-Process -Id $pid_ -ErrorAction SilentlyContinue
    Write-Host "Error: el puerto $Puerto ya está en uso por $($proc.ProcessName) (PID $pid_)." -ForegroundColor Red
    Write-Host "Detenelo con:  taskkill /PID $pid_ /F     (o usá otro puerto con -Puerto)"
    exit 1
}

$python = Join-Path $proyecto ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Host "Falta .venv. Corré inicio.bat primero." -ForegroundColor Red; exit 1
}

# El .env del cliente DEBE ganar: load_dotenv() de main.py busca hacia arriba desde
# backend/ y encontraría el .env del proyecto, con otro PIN_SALT — y entonces ningún
# PIN del cliente validaría, con el error mostrándose como "PIN incorrecto".
# Se parsea con dotenv y no leyendo el archivo a mano: los .env de Windows traen CRLF
# y un PIN_SALT con un byte de más hashea distinto.
$envPath = (Join-Path $trabajo ".env") -replace '\\', '/'
$pares = & $python -c @"
from dotenv import dotenv_values
for k, v in dotenv_values(r'$envPath').items():
    if v is not None:
        print(f'{k}={v}')
"@
foreach ($linea in $pares) {
    if ($linea -match '^([^=]+)=(.*)$') {
        Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2]
    }
}

# Sin esto, load_dotenv() completaría desde el .env del proyecto y verías funciones
# que el cliente no tiene contratadas (ej. el escaneo con IA).
if (-not ($pares -match '^ZAI_API_KEY=.')) { Remove-Item Env:ZAI_API_KEY -ErrorAction SilentlyContinue }

# dist/ se resuelve relativo a backend/main.py, no al cwd, así que basta con que esté
# compilado en el proyecto. Se recompila SIEMPRE: con "solo si no existe" quedaba
# servido el bundle viejo y los cambios de pantalla no aparecían.
if (-not $SinBuild) {
    Write-Host "Compilando frontend..."
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Host "Error: falló npm run build." -ForegroundColor Red; exit 1 }
}

Write-Host ""
Write-Host "Base:   $trabajo\pasteleria.db"
Write-Host "PINs:   los del cliente (usando su PIN_SALT)"
Write-Host "Abrir:  http://localhost:$Puerto" -ForegroundColor Green
Write-Host "Ctrl+C para detener."
Write-Host ""

Set-Location $trabajo
$env:PYTHONPATH = $proyecto
& $python -m uvicorn backend.main:app --host 127.0.0.1 --port $Puerto
