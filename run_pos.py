"""
Punto de entrada para el ejecutable empaquetado (PyInstaller).

Responsabilidades, en orden:
1. Ubicar la carpeta de datos (junto al .exe cuando está congelado).
2. Generar secretos (.env) en el primer arranque si no existen.
3. Dejar que la DB y el .env se resuelvan en esa carpeta (os.chdir).
4. Abrir el navegador en modo kiosko en un hilo aparte.
5. Lanzar uvicorn.

Correr en desarrollo: `python run_pos.py` (equivalente a inicio.bat).
"""
import os
import sys
import time
import secrets
import threading
import subprocess
from pathlib import Path

HOST = "127.0.0.1"
PORT = 8000
URL = f"http://localhost:{PORT}"
KIOSK_PROFILE_NAME = "PuntoVentaKiosk"


def app_dir() -> Path:
    """Carpeta donde viven los datos: junto al .exe, o la raíz del proyecto en dev."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).parent


def ensure_env(base: Path) -> None:
    """Crea .env con secretos aleatorios en el primer arranque; luego lo carga."""
    env_path = base / ".env"
    if not env_path.exists():
        env_path.write_text(
            f"PIN_SALT={secrets.token_hex(32)}\n"
            f"JWT_SECRET_KEY={secrets.token_hex(32)}\n",
            encoding="utf-8",
        )
    from dotenv import load_dotenv
    load_dotenv(env_path)


def find_browser():
    """Retorna (ruta, tipo) del primer navegador Chromium encontrado, o (None, None)."""
    chrome = [
        r"%ProgramFiles%\Google\Chrome\Application\chrome.exe",
        r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe",
        r"%LocalAppData%\Google\Chrome\Application\chrome.exe",
    ]
    for p in chrome:
        p = os.path.expandvars(p)
        if os.path.exists(p):
            return p, "chrome"
    edge = [
        r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe",
        r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe",
    ]
    for p in edge:
        p = os.path.expandvars(p)
        if os.path.exists(p):
            return p, "edge"
    return None, None


def open_kiosk() -> None:
    """Espera a que el servidor levante y abre el navegador en pantalla completa."""
    time.sleep(2)
    browser, kind = find_browser()
    profile = os.path.join(os.path.expandvars("%LocalAppData%"), KIOSK_PROFILE_NAME)
    if kind == "edge":
        subprocess.Popen([
            browser, "--kiosk", URL, "--edge-kiosk-type=fullscreen",
            "--no-first-run", f"--user-data-dir={profile}",
        ])
    elif kind == "chrome":
        subprocess.Popen([
            browser, "--kiosk", URL, "--no-first-run",
            f"--user-data-dir={profile}",
        ])
    else:
        import webbrowser
        webbrowser.open(URL)


def main() -> None:
    base = app_dir()
    os.chdir(base)            # la DB (pasteleria.db) y el .env quedan junto al .exe
    ensure_env(base)

    if not os.environ.get("POS_NO_BROWSER"):
        threading.Thread(target=open_kiosk, daemon=True).start()

    import uvicorn
    from backend.main import app
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
