@echo off
title Punto de Venta - Pasteleria
cd /d "%~dp0"

:: Verificar Python
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python no esta instalado o no esta en el PATH.
    echo Descargalo desde https://python.org ^(marcar "Add to PATH"^)
    pause
    exit /b 1
)

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
echo Iniciando Punto de Venta en http://localhost:8000
echo Cierra esta ventana para detener el servidor.
echo.

:: Abrir browser despues de 2 segundos
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8000"

:: Iniciar servidor
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
