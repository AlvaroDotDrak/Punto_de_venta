@echo off
title Punto de Venta - Cevicheria
cd /d "%~dp0"

:: Subproceso que abre el navegador en kiosko (relanzado por este mismo .bat)
if "%~1"=="--browser" goto launchbrowser

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

:: Compilar el frontend SIEMPRE. Antes solo lo hacia si dist\ no existia, y como
:: dist\ no viaja en el repo (esta en .gitignore), tras un git pull quedaba el
:: bundle viejo y los cambios de pantalla no aparecian.
:: Para saltarlo (arranque rapido sin tocar el frontend): inicio.bat --sin-build
if /i "%~1"=="--sin-build" (
    echo Saltando la compilacion del frontend.
) else (
    echo Compilando frontend...
    call npm run build
    if errorlevel 1 (
        echo.
        echo Error: fallo npm run build. Corre "npm install" y vuelve a intentar.
        pause
        exit /b 1
    )
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
echo Iniciando Punto de Venta en http://localhost:8000
echo Cierra esta ventana para detener el servidor.
echo.

:: Abrir navegador despues de 2 segundos
if defined BROWSER (
    start "" /min "%~f0" --browser
    echo Modo kiosko activado. Para salir: Alt+F4 ^(cierra la ventana del navegador^).
) else (
    start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8000"
    echo No se encontro Chrome ni Edge: abriendo en el navegador por defecto ^(sin kiosko^).
)

:: Iniciar servidor
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
goto :eof

:launchbrowser
timeout /t 2 /nobreak >nul
:: Los tres --disable-*background* evitan que el navegador congele la ventana del
:: POS cuando queda tapada por otra ventana (el local suele tener una segunda
:: ventana para el correo). Al congelarla, los timers se detienen y al volver la
:: pestaña se recarga: ahí se perdia la sesion.
set KIOSKFLAGS=--no-first-run --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling
if "%BROWSER_KIND%"=="edge" (
    start "" "%BROWSER%" --kiosk http://localhost:8000 --edge-kiosk-type=fullscreen %KIOSKFLAGS% --user-data-dir="%LocalAppData%\PuntoVentaKiosk"
) else (
    start "" "%BROWSER%" --kiosk http://localhost:8000 %KIOSKFLAGS% --user-data-dir="%LocalAppData%\PuntoVentaKiosk"
)
exit /b
