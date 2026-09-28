"""Простая авторизация: пароли PBKDF2, сессия — подписанный токен в cookie."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .config import SECRET_KEY, SESSION_DAYS
from .db import get_db
from .models import User

COOKIE_NAME = "kp_session"
_ITER = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITER)
    return f"pbkdf2${_ITER}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iters, salt, digest = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iters))
        return hmac.compare_digest(dk.hex(), digest)
    except ValueError:
        return False


def _sign(payload: str) -> str:
    return hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()


def make_token(user: User) -> str:
    expires = int(time.time()) + SESSION_DAYS * 86400
    # хэш пароля в подписи: смена пароля завершает старые сессии
    payload = f"{user.id}:{expires}:{user.password_hash[-16:]}"
    raw = f"{user.id}:{expires}:{_sign(payload)}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def read_token(token: str, db: Session) -> User | None:
    try:
        uid, expires, sig = base64.urlsafe_b64decode(token.encode()).decode().split(":")
        if int(expires) < time.time():
            return None
        user = db.get(User, int(uid))
    except Exception:
        return None
    if not user:
        return None
    expected = _sign(f"{user.id}:{expires}:{user.password_hash[-16:]}")
    return user if hmac.compare_digest(expected, sig) else None


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    user = read_token(token, db) if token else None
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Требуется вход")
    return user


def admin_user(user: User = Depends(current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Только для администратора")
    return user
