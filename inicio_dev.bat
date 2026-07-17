@echo off
title Punto de Venta - Cevicheria DEV (puerto 8001)
cd /d "%~dp0"

:: Subproceso que abre el navegador en kiosko (relanzado por este mismo .bat)
if "%~1"=="--browser" goto launchbrowser

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

:: Detectar navegador para modo kiosko (pantalla completa, sin barra)
set "BROWSER="
set "BROWSER_KIND=chrome"
for %%P in (
    "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
    "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
    "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do if not defined BROWSER if exist "%%~P" set "BROWSER=%%~P"

if not defined BROWSER for %%P in (
    "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
    "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
) do if not defined BROWSER if exist "%%~P" set "BROWSER=%%~P" & set "BROWSER_KIND=edge"

echo.
echo Iniciando servidor DEV en http://localhost:8001
echo Cierra esta ventana para detener el servidor.
echo.

:: Abrir navegador despues de 2 segundos
if defined BROWSER (
    start "" /min "%~f0" --browser
    echo Modo kiosko activado. Para salir: Alt+F4 ^(cierra la ventana del navegador^).
) else (
    start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8001"
    echo No se encontro Chrome ni Edge: abriendo en el navegador por defecto ^(sin kiosko^).
)

:: Iniciar servidor en puerto 8001
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8001
goto :eof

:launchbrowser
timeout /t 2 /nobreak >nul
if "%BROWSER_KIND%"=="edge" (
    start "" "%BROWSER%" --kiosk http://localhost:8001 --edge-kiosk-type=fullscreen --no-first-run --user-data-dir="%LocalAppData%\PuntoVentaKioskDev"
) else (
    start "" "%BROWSER%" --kiosk http://localhost:8001 --no-first-run --user-data-dir="%LocalAppData%\PuntoVentaKioskDev"
)
exit /b
