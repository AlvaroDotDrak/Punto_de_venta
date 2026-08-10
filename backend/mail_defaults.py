"""Cuenta emisora de fábrica del resumen del turno.

El local no configura servidor ni contraseña: lo único que carga en Configuración
es a quién le llega el correo. Las credenciales viajan dentro del .exe.

Eso tiene un límite que conviene tener presente: PyInstaller no cifra nada, así
que quien tenga el ejecutable puede recuperarlas. El base64 de acá evita que la
clave aparezca en un `strings` del binario — sube el costo, no lo elimina. Por
eso la cuenta es dedicada y no se usa para nada más: si algún día se filtra, se
rota desde Google y se recompila, sin tocar ninguna otra cosa.

Mover esto a un relay con clave de solo envío (Brevo, SES) es cambiar las tres
constantes de abajo, y ahí una filtración deja de dar acceso de lectura a la
casilla — una contraseña de aplicación de Gmail también sirve para IMAP.

El secreto real vive en backend/mail_secrets.py, que NUNCA se commitea (el
repo es público). Ver mail_secrets.py.example para crearlo en una máquina
nueva. Sin ese archivo y sin las variables de entorno, sender() devuelve
credenciales vacías: el correo queda sin configurar, no crashea.

Prioridad de resolución (la primera que exista gana):
  1. lo que el admin guardó en system_config  → mailer.get_mail_config
  2. variables de entorno POS_SMTP_*          → permiten rotar sin recompilar
  3. backend/mail_secrets.py (gitignored)
"""
import os

try:
    from . import mail_secrets
except ImportError:
    mail_secrets = None


def sender() -> dict:
    """Credenciales de fábrica ya resueltas contra el entorno."""
    try:
        port = int(os.environ.get("POS_SMTP_PORT") or 0)
    except ValueError:
        port = 0
    fallback_port = getattr(mail_secrets, "PORT", 587) if mail_secrets else 587
    return {
        "host": os.environ.get("POS_SMTP_HOST")
                or (mail_secrets.HOST if mail_secrets else "smtp.gmail.com"),
        "port": port if port > 0 else fallback_port,
        "user": os.environ.get("POS_SMTP_USER")
                or (mail_secrets.USER if mail_secrets else ""),
        "password": (os.environ.get("POS_SMTP_PASSWORD")
                     or (mail_secrets.password() if mail_secrets else "")),
    }
