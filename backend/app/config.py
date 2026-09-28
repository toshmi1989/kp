import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("KP_DATA_DIR", BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.environ.get("KP_DATABASE_URL", f"sqlite:///{DATA_DIR / 'kp.sqlite3'}")
FRONTEND_DIST = Path(os.environ.get("KP_FRONTEND_DIST", BASE_DIR.parent / "frontend" / "dist"))

ADMIN_USERNAME = os.environ.get("KP_ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("KP_ADMIN_PASSWORD", "admin")

SESSION_DAYS = int(os.environ.get("KP_SESSION_DAYS", "30"))


def normalized_base_path() -> str:
    """Префикс портала, например /kp. Пусто — приложение на корне (отдельный запуск)."""
    raw = (os.environ.get("KP_BASE_PATH") or os.environ.get("BASE_PATH") or "").strip()
    if not raw or raw == "/":
        return ""
    return "/" + raw.strip("/")


def cookie_path() -> str:
    return normalized_base_path() or "/"


def _secret_key() -> str:
    key = os.environ.get("KP_SECRET_KEY")
    if key:
        return key
    path = DATA_DIR / "secret.key"
    if not path.exists():
        path.write_text(secrets.token_hex(32))
        path.chmod(0o600)
    return path.read_text().strip()


SECRET_KEY = _secret_key()
