from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from . import defaults as D


class StageIn(BaseModel):
    name: str
    duration: str = ""


class StageOut(StageIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    position: int


# ------------------------------------------------------------ реестр услуг

class ServiceBase(BaseModel):
    name: str = Field(min_length=1)
    category: str = ""
    keywords: str = ""
    table_group: str = ""
    description: str = ""
    duration_label: str = D.DURATION_LABEL
    duration_text: str = ""
    price: Decimal | None = None
    price_text: str = ""
    price_unit: str = D.PRICE_UNIT
    price_note: str = ""
    section_title: str = ""
    intro_text: str = ""
    price_header: str = ""
    stages_title: str = ""
    stages_name_header: str = D.STAGES_NAME_HEADER
    stages_duration_header: str = D.STAGES_DURATION_HEADER
    footnotes: str = ""
    extra_text: str = ""
    active: bool = True


class ServiceIn(ServiceBase):
    stages: list[StageIn] = []


class ServiceOut(ServiceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    stages: list[StageOut] = []
    updated_at: datetime | None = None


class ServiceShort(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    category: str
    price: Decimal | None
    price_text: str
    price_unit: str
    stages_count: int = 0
    active: bool = True
    updated_at: datetime | None = None


# ------------------------------------------------------------ КП

class ProposalItem(BaseModel):
    service_id: int | None = None
    name: str
    table_group: str = ""
    description: str = ""
    duration_label: str = D.DURATION_LABEL
    duration_text: str = ""
    price: Decimal | None = None
    price_text: str = ""
    price_unit: str = D.PRICE_UNIT
    price_note: str = ""
    show_stages: bool = True
    stages_title: str = ""
    stages_name_header: str = D.STAGES_NAME_HEADER
    stages_duration_header: str = D.STAGES_DURATION_HEADER
    stages: list[StageIn] = []


class ProposalData(BaseModel):
    """Полный снимок КП — ровно то, что попадёт в документ."""
    company: str = ""
    director_full: str = ""
    director_position: str = D.DIRECTOR_POSITION
    recipient_position: str = D.RECIPIENT_POSITION
    director_short: str = ""
    greeting: str = ""
    intro_text: str = D.INTRO_TEXT
    section_title: str = D.SECTION_TITLE
    price_header: str = D.PRICE_HEADER
    validity: str = D.VALIDITY
    footnotes: str = ""
    extra_text: str = ""
    items: list[ProposalItem] = []


class ProposalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    number: int
    company: str
    director_full: str
    services_summary: str
    author: str
    created_at: datetime


class ProposalDetail(ProposalOut):
    data: ProposalData


class GenerateRequest(BaseModel):
    data: ProposalData
    # id услуг, цену которых нужно обновить в реестре по значениям из КП
    update_registry_prices: list[int] = []


class DraftRequest(BaseModel):
    company: str = ""
    director_full: str = ""
    director_position: str = D.DIRECTOR_POSITION
    service_ids: list[int] = []


class NameForms(BaseModel):
    director_short: str
    greeting: str
    recipient_position: str
    gender: str


# ------------------------------------------------------------ пользователи

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    full_name: str
    is_admin: bool


class UserIn(BaseModel):
    username: str = Field(min_length=2)
    full_name: str = ""
    password: str | None = None
    is_admin: bool = False


class LoginIn(BaseModel):
    username: str
    password: str
