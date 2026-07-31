"""Helpers compartidos por los routers.

Vive acá y no en utils.py porque conoce HTTPException: utils.py es lógica pura
(la que cubren los tests sin levantar la app).
"""
from datetime import datetime

from fastapi import HTTPException


def parse_date_from(value: str | None) -> datetime | None:
    """Fecha de inicio de un filtro (YYYY-MM-DD o ISO completo).

    Sin este guard, un valor inválido explotaba con ValueError → HTTP 500. Un
    filtro mal escrito es un error del cliente, no una falla del servidor.
    """
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Fecha inválida: '{value}'. Usa el formato YYYY-MM-DD")


def parse_date_to(value: str | None) -> datetime | None:
    """Fecha de fin de un filtro, extendida al final del día para que el rango
    sea inclusivo (un `date_to` a las 00:00 se comería todo el último día)."""
    if not value:
        return None
    try:
        base = datetime.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Fecha inválida: '{value}'. Usa el formato YYYY-MM-DD")
    # Si vino solo la fecha (sin hora), se extiende al último instante del día.
    if base.hour == 0 and base.minute == 0 and base.second == 0:
        return base.replace(hour=23, minute=59, second=59, microsecond=999999)
    return base
