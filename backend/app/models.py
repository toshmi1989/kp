from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (Boolean, DateTime, ForeignKey, Integer, LargeBinary,
                        Numeric, String, Text)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from . import defaults as D
from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Service(Base):
    """Услуга из реестра. Поля повторяют блоки шаблона КП."""
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(255), default="", index=True)
    keywords: Mapped[str] = mapped_column(Text, default="")
    # заголовок-строка внутри таблицы (например «МОДУЛЬ 1. АДМИНИСТРАТИВНАЯ ИНФОРМАЦИЯ»)
    table_group: Mapped[str] = mapped_column(Text, default="")
    description: Mapped[str] = mapped_column(Text, default="")
    duration_label: Mapped[str] = mapped_column(String(255), default=D.DURATION_LABEL)
    duration_text: Mapped[str] = mapped_column(Text, default="")
    price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    price_text: Mapped[str] = mapped_column(String(255), default="")
    price_unit: Mapped[str] = mapped_column(String(255), default=D.PRICE_UNIT)
    price_note: Mapped[str] = mapped_column(Text, default="")
    # переопределения текстов КП, если услуга требует своих формулировок
    section_title: Mapped[str] = mapped_column(Text, default="")
    intro_text: Mapped[str] = mapped_column(Text, default="")
    price_header: Mapped[str] = mapped_column(String(255), default="")
    # детализация
    stages_title: Mapped[str] = mapped_column(Text, default="")
    stages_name_header: Mapped[str] = mapped_column(String(255), default=D.STAGES_NAME_HEADER)
    stages_duration_header: Mapped[str] = mapped_column(String(255), default=D.STAGES_DURATION_HEADER)
    footnotes: Mapped[str] = mapped_column(Text, default="")
    extra_text: Mapped[str] = mapped_column(Text, default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    updated_by: Mapped[str] = mapped_column(String(64), default="")

    stages: Mapped[list[Stage]] = relationship(
        back_populates="service", cascade="all, delete-orphan",
        order_by="Stage.position")


class Stage(Base):
    __tablename__ = "stages"

    id: Mapped[int] = mapped_column(primary_key=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(Text)
    duration: Mapped[str] = mapped_column(String(255), default="")

    service: Mapped[Service] = relationship(back_populates="stages")


class Proposal(Base):
    """Сформированное КП: снимок данных + готовый файл."""
    __tablename__ = "proposals"

    id: Mapped[int] = mapped_column(primary_key=True)
    company: Mapped[str] = mapped_column(Text, default="")
    director_full: Mapped[str] = mapped_column(Text, default="")
    services_summary: Mapped[str] = mapped_column(Text, default="")
    data_json: Mapped[str] = mapped_column(Text)
    docx: Mapped[bytes] = mapped_column(LargeBinary)
    author: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)

    @property
    def number(self) -> int:
        return self.id
