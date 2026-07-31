#!/usr/bin/env python3
"""Resetea el PIN de un usuario en una base de datos del POS.

    python3 reset_pin.py [carpeta_con_la_db]

Sin argumento usa la del proyecto. El PIN se pide por teclado y no se muestra:
así no queda en el historial del shell ni en ningún archivo. No hay forma de
LEER un PIN existente (se guardan hasheados) — solo de reemplazarlo.

Usa el PIN_SALT del .env que esté junto a esa base: el hash depende de la
instalación, así que un PIN reseteado con otro salt no validaría.
"""
import getpass
import hashlib
import sqlite3
import sys
from pathlib import Path


def main() -> int:
    base = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    db_path = base / "pasteleria.db"
    env_path = base / ".env"

    if not db_path.exists():
        print(f"No hay pasteleria.db en {base}")
        return 1
    if not env_path.exists():
        print(f"No hay .env en {base}. Sin el PIN_SALT de esa instalación el hash no sirve.")
        return 1

    salt = None
    for linea in env_path.read_text(encoding="utf-8").splitlines():
        if linea.startswith("PIN_SALT="):
            salt = linea.split("=", 1)[1].strip()
    if not salt:
        print("El .env no tiene PIN_SALT.")
        return 1

    con = sqlite3.connect(db_path)
    usuarios = con.execute(
        "SELECT id, name, role, active, locked_until FROM sellers ORDER BY id"
    ).fetchall()
    if not usuarios:
        print("Esa base no tiene usuarios.")
        return 1

    print(f"\nBase: {db_path}\n")
    for uid, nombre, rol, activo, bloqueo in usuarios:
        estado = "" if activo else "  (inactivo)"
        estado += "  (bloqueado)" if bloqueo else ""
        print(f"  {uid}. {nombre:22} {rol}{estado}")

    try:
        elegido = input("\nID del usuario a resetear: ").strip()
        fila = next((u for u in usuarios if str(u[0]) == elegido), None)
        if not fila:
            print("Ese ID no existe.")
            return 1

        pin = getpass.getpass(f"PIN nuevo para {fila[1]} (no se muestra): ")
        if len(pin) < 4 or not pin.isdigit():
            print("El PIN debe ser numérico y de al menos 4 dígitos.")
            return 1
        if pin != getpass.getpass("Repetir el PIN: "):
            print("Los PIN no coinciden.")
            return 1
    except (EOFError, KeyboardInterrupt):
        print("\nCancelado.")
        return 1

    # Mismo esquema que backend/auth.py::hash_pin
    con.execute(
        "UPDATE sellers SET pin = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?",
        (hashlib.sha256((pin + salt).encode()).hexdigest(), fila[0]),
    )
    con.commit()
    print(f"\nListo: {fila[1]} tiene PIN nuevo y quedó desbloqueado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
