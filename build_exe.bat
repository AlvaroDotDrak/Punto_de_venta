@echo off
title Compilar Punto de Venta (.exe)
cd /d "%~dp0"

:: 1. Activar entorno virtual
if not exist ".venv\" (
    echo Error: no existe .venv. Corre inicio.bat primero para crear el entorno.
    pause
    exit /b 1
)
call .venv\Scripts\activate.bat

:: 2. Instalar PyInstaller si falta
python -c "import PyInstaller" >nul 2>&1
if errorlevel 1 (
    echo Instalando PyInstaller...
    pip install pyinstaller
)

:: 3. Compilar el frontend (siempre, para empaquetar la version actual)
echo Compilando frontend...
call npm run build
if errorlevel 1 (
    echo Error: fallo npm run build.
    pause
    exit /b 1
)

:: 4. Empaquetar el .exe
::    --distpath release  -> evita colision con dist/ (frontend React)
::    --add-data dist;dist -> empaqueta el frontend dentro del .exe
echo Empaquetando ejecutable...
pyinstaller --noconfirm --onefile --name PuntoVenta ^
    --distpath release ^
    --workpath build_pyi ^
    --specpath build_pyi ^
    --add-data "%~dp0dist;dist" ^
    --collect-submodules uvicorn ^
    --hidden-import win32print ^
    --hidden-import win32timezone ^
    --hidden-import openpyxl ^
    run_pos.py

if errorlevel 1 (
    echo Error: fallo el empaquetado.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  Listo: release\PuntoVenta.exe
echo  Entregar SOLO ese archivo. La DB (.db) y el .env se crean
echo  solos en la carpeta donde se ejecute, en el primer arranque.
echo ============================================================
pause
