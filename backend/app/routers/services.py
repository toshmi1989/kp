from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import defaults as D
from ..auth import current_user
from ..db import get_db
from ..models import Service, User
from ..registry import apply_service, export_registry, import_registry, search_services
from ..schemas import ServiceIn, ServiceOut, ServiceShort

router = APIRouter(prefix="/api", tags=["services"], dependencies=[Depends(current_user)])

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _short(s: Service) -> ServiceShort:
    return ServiceShort(id=s.id, name=s.name, category=s.category, price=s.price,
                        price_text=s.price_text, price_unit=s.price_unit,
                        stages_count=len(s.stages), active=s.active, updated_at=s.updated_at)


def _get(db: Session, service_id: int) -> Service:
    svc = db.get(Service, service_id, options=[selectinload(Service.stages)])
    if not svc:
        raise HTTPException(404, "Услуга не найдена")
    return svc


@router.get("/meta")
def meta(db: Session = Depends(get_db)):
    categories = sorted({c for c in db.scalars(select(Service.category)) if c})
    groups = sorted({g for g in db.scalars(select(Service.table_group)) if g})
    return {
        "price_units": D.PRICE_UNITS,
        "categories": categories,
        "table_groups": groups,
        "defaults": {
            "duration_label": D.DURATION_LABEL,
            "price_unit": D.PRICE_UNIT,
            "stages_name_header": D.STAGES_NAME_HEADER,
            "stages_duration_header": D.STAGES_DURATION_HEADER,
            "section_title": D.SECTION_TITLE,
            "intro_text": D.INTRO_TEXT,
            "price_header": D.PRICE_HEADER,
            "validity": D.VALIDITY,
        },
    }


@router.get("/services", response_model=list[ServiceShort])
def list_services(q: str = "", category: str = "", include_inactive: bool = True,
                  db: Session = Depends(get_db)):
    stmt = select(Service).options(selectinload(Service.stages)).order_by(Service.category, Service.name)
    if category:
        stmt = stmt.where(Service.category == category)
    if not include_inactive:
        stmt = stmt.where(Service.active.is_(True))
    items = db.scalars(stmt).all()
    if q:
        ql = q.lower().replace("ё", "е")
        items = [s for s in items
                 if ql in f"{s.name} {s.keywords} {s.category}".lower().replace("ё", "е")]
    return [_short(s) for s in items]


@router.get("/services/search", response_model=list[ServiceShort])
def search(q: str = "", limit: int = Query(10, le=50), db: Session = Depends(get_db)):
    return [_short(s) for s in search_services(db, q, limit)]


@router.get("/services/{service_id}", response_model=ServiceOut)
def get_service(service_id: int, db: Session = Depends(get_db)):
    return _get(db, service_id)


@router.post("/services", response_model=ServiceOut)
def create_service(data: ServiceIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    svc = apply_service(Service(), data, user.username)
    db.add(svc)
    db.commit()
    return _get(db, svc.id)


@router.put("/services/{service_id}", response_model=ServiceOut)
def update_service(service_id: int, data: ServiceIn, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    svc = _get(db, service_id)
    apply_service(svc, data, user.username)
    db.commit()
    db.expire_all()
    return _get(db, service_id)


@router.post("/services/{service_id}/copy", response_model=ServiceOut)
def copy_service(service_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    src = _get(db, service_id)
    data = ServiceIn.model_validate({**ServiceOut.model_validate(src).model_dump(),
                                     "name": f"{src.name} (копия)"})
    svc = apply_service(Service(), data, user.username)
    db.add(svc)
    db.commit()
    return _get(db, svc.id)


@router.delete("/services/{service_id}")
def delete_service(service_id: int, db: Session = Depends(get_db)):
    svc = db.get(Service, service_id)
    if svc:
        db.delete(svc)
        db.commit()
    return {"ok": True}


# ------------------------------------------------------------ Excel

def _xlsx(content: bytes, filename: str) -> Response:
    return Response(content, media_type=XLSX, headers={
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"})


@router.get("/registry/export")
def export(db: Session = Depends(get_db)):
    return _xlsx(export_registry(db), "Реестр услуг.xlsx")


@router.get("/registry/template")
def template(db: Session = Depends(get_db)):
    return _xlsx(export_registry(db, empty=True), "Шаблон реестра услуг.xlsx")


@router.post("/registry/import")
async def import_(file: UploadFile = File(...), user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    content = await file.read()
    try:
        return import_registry(db, content, user.username)
    except ValueError as e:
        db.rollback()
        raise HTTPException(400, str(e))
