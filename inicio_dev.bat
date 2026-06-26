@echo off
title Punto de Venta - DEV (puerto 8001)
cd /d "%~dp0"

:: Crear entorno virtual si no existe
if not exist ".venv\" (
    echo Creando entorno virtual...
    python -m venv .venv
    call .venv\Scripts\activate.bat
    echo Instalando dependencias...
    pip install -r requirements.txt
) else (
    call .venv\Scripts\activate.bat
)

:: Compilar frontend si dist/ no existe
if not exist "dist\" (
    echo Compilando frontend...
    npm run build
)

echo.
echo Iniciando servidor DEV en http://localhost:8001
echo Cierra esta ventana para detener el servidor.
echo.

:: Abrir browser despues de 2 segundos
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8001"

:: Iniciar servidor en puerto 8001
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8001
