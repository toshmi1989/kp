import json
import re
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..auth import current_user
from ..db import get_db
from ..docgen import render_docx
from ..models import Proposal, Service, User
from ..proposals import build_draft
from ..russian import name_forms
from ..schemas import (DraftRequest, GenerateRequest, NameForms, ProposalData,
                       ProposalDetail, ProposalOut)

router = APIRouter(prefix="/api", tags=["proposals"], dependencies=[Depends(current_user)])

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@router.get("/name-forms", response_model=NameForms)
def get_name_forms(full_name: str = "", position: str = "", gender: str | None = None):
    return name_forms(full_name, position, gender if gender in ("m", "f") else None)


@router.post("/proposals/draft", response_model=ProposalData)
def draft(req: DraftRequest, db: Session = Depends(get_db)):
    found = {s.id: s for s in db.scalars(
        select(Service).where(Service.id.in_(req.service_ids))
        .options(selectinload(Service.stages))).all()}
    services = [found[i] for i in req.service_ids if i in found]
    return build_draft(services, req.company, req.director_full, req.director_position)


def _filename(p: Proposal) -> str:
    company = re.sub(r'[\\/:*?"<>|«»]+', "", p.company).strip() or "клиент"
    return f"КП №{p.id} {company} {p.created_at:%d.%m.%Y}.docx"


def _download(p: Proposal) -> Response:
    return Response(p.docx, media_type=DOCX, headers={
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(_filename(p))}"})


@router.post("/proposals/preview-docx")
def preview_docx(data: ProposalData):
    """Сформировать .docx без сохранения в историю."""
    return Response(render_docx(data), media_type=DOCX, headers={
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote('КП (черновик).docx')}"})


@router.post("/proposals", response_model=ProposalOut)
def generate(req: GenerateRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    data = req.data
    if not data.items:
        raise HTTPException(400, "Добавьте хотя бы одну услугу")
    content = render_docx(data)

    # по желанию — обновить цены в реестре значениями из КП
    for item in data.items:
        if item.service_id and item.service_id in req.update_registry_prices:
            svc = db.get(Service, item.service_id)
            if svc:
                svc.price = item.price
                svc.price_text = item.price_text
                svc.price_unit = item.price_unit
                svc.updated_by = user.username

    p = Proposal(
        company=data.company,
        director_full=data.director_full,
        services_summary="; ".join(i.name for i in data.items),
        data_json=data.model_dump_json(),
        docx=content,
        author=user.full_name or user.username,
    )
    db.add(p)
    db.commit()
    return p


@router.get("/proposals", response_model=list[ProposalOut])
def list_proposals(q: str = "", limit: int = Query(100, le=500), db: Session = Depends(get_db)):
    stmt = select(Proposal).order_by(Proposal.id.desc()).limit(limit)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Proposal.company.ilike(like), Proposal.director_full.ilike(like),
                              Proposal.services_summary.ilike(like), Proposal.author.ilike(like)))
    items = db.scalars(stmt).all()
    if q and not items:
        # SQLite ilike не понимает регистр кириллицы — дофильтруем в Python
        ql = q.lower()
        items = [p for p in db.scalars(select(Proposal).order_by(Proposal.id.desc())).all()
                 if ql in f"{p.company} {p.director_full} {p.services_summary} {p.author}".lower()][:limit]
    return items


@router.get("/proposals/{proposal_id}", response_model=ProposalDetail)
def get_proposal(proposal_id: int, db: Session = Depends(get_db)):
    p = db.get(Proposal, proposal_id)
    if not p:
        raise HTTPException(404, "КП не найдено")
    return ProposalDetail(**ProposalOut.model_validate(p).model_dump(),
                          data=ProposalData.model_validate(json.loads(p.data_json)))


@router.get("/proposals/{proposal_id}/docx")
def download(proposal_id: int, db: Session = Depends(get_db)):
    p = db.get(Proposal, proposal_id)
    if not p:
        raise HTTPException(404, "КП не найдено")
    return _download(p)


@router.delete("/proposals/{proposal_id}")
def delete_proposal(proposal_id: int, db: Session = Depends(get_db)):
    p = db.get(Proposal, proposal_id)
    if p:
        db.delete(p)
        db.commit()
    return {"ok": True}


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    return {
        "services": db.scalar(select(func.count(Service.id))),
        "proposals": db.scalar(select(func.count(Proposal.id))),
    }
