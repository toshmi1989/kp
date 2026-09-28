from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import (COOKIE_NAME, admin_user, current_user, hash_password,
                    make_token, verify_password)
from ..config import SESSION_DAYS
from ..db import get_db
from ..models import User
from ..schemas import LoginIn, UserIn, UserOut

router = APIRouter(prefix="/api", tags=["auth"])


@router.post("/login", response_model=UserOut)
def login(data: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.username) == data.username.strip().lower()))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Неверный логин или пароль")
    response.set_cookie(COOKIE_NAME, make_token(user), max_age=SESSION_DAYS * 86400,
                        httponly=True, samesite="lax")
    return user


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


class PasswordIn(BaseModel):
    old_password: str
    new_password: str


@router.post("/me/password")
def change_password(data: PasswordIn, response: Response, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(data.old_password, user.password_hash):
        raise HTTPException(400, "Текущий пароль указан неверно")
    if len(data.new_password) < 6:
        raise HTTPException(400, "Новый пароль — минимум 6 символов")
    user.password_hash = hash_password(data.new_password)
    db.commit()
    response.set_cookie(COOKIE_NAME, make_token(user), max_age=SESSION_DAYS * 86400,
                        httponly=True, samesite="lax")
    return {"ok": True}


# ------------------------------------------------------------ пользователи (админ)

@router.get("/users", response_model=list[UserOut])
def list_users(_: User = Depends(admin_user), db: Session = Depends(get_db)):
    return db.scalars(select(User).order_by(User.username)).all()


@router.post("/users", response_model=UserOut)
def create_user(data: UserIn, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    if not data.password or len(data.password) < 6:
        raise HTTPException(400, "Пароль — минимум 6 символов")
    if db.scalar(select(User).where(func.lower(User.username) == data.username.lower())):
        raise HTTPException(400, "Такой логин уже есть")
    user = User(username=data.username.strip(), full_name=data.full_name.strip(),
                is_admin=data.is_admin, password_hash=hash_password(data.password))
    db.add(user)
    db.commit()
    return user


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserIn, admin: User = Depends(admin_user),
                db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    if user.id == admin.id and not data.is_admin:
        raise HTTPException(400, "Нельзя снять права администратора с себя")
    user.full_name = data.full_name.strip()
    user.is_admin = data.is_admin
    if data.password:
        if len(data.password) < 6:
            raise HTTPException(400, "Пароль — минимум 6 символов")
        user.password_hash = hash_password(data.password)
    db.commit()
    return user


@router.delete("/users/{user_id}")
def delete_user(user_id: int, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    if user_id == admin.id:
        raise HTTPException(400, "Нельзя удалить самого себя")
    user = db.get(User, user_id)
    if user:
        db.delete(user)
        db.commit()
    return {"ok": True}
