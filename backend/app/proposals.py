"""Сборка черновика КП из услуг реестра."""

from __future__ import annotations

from . import defaults as D
from .models import Service
from .russian import name_forms
from .schemas import ProposalData, ProposalItem, StageIn


def item_from_service(s: Service) -> ProposalItem:
    return ProposalItem(
        service_id=s.id,
        name=s.name,
        table_group=s.table_group,
        description=s.description,
        duration_label=s.duration_label,
        duration_text=s.duration_text,
        price=s.price,
        price_text=s.price_text,
        price_unit=s.price_unit,
        price_note=s.price_note,
        show_stages=bool(s.stages),
        stages_title=s.stages_title or (f"{s.name} состоит из следующих этапов:" if s.stages else ""),
        stages_name_header=s.stages_name_header or D.STAGES_NAME_HEADER,
        stages_duration_header=s.stages_duration_header or D.STAGES_DURATION_HEADER,
        stages=[StageIn(name=st.name, duration=st.duration) for st in s.stages],
    )


def _merge_lines(texts: list[str]) -> str:
    seen: list[str] = []
    for t in texts:
        for line in (t or "").splitlines():
            line = line.strip()
            if line and line not in seen:
                seen.append(line)
    return "\n".join(seen)


def build_draft(services: list[Service], company: str, director_full: str,
                director_position: str) -> ProposalData:
    forms = name_forms(director_full, director_position)
    first = lambda attr: next((getattr(s, attr) for s in services if getattr(s, attr)), "")  # noqa: E731

    if len(services) == 1 and not first("section_title"):
        # одна услуга — заголовок раздела по её названию, как в образцах
        section_title = services[0].name.upper()
    else:
        section_title = first("section_title") or D.SECTION_TITLE

    return ProposalData(
        company=company,
        director_full=director_full,
        director_position=director_position,
        recipient_position=forms["recipient_position"] or D.RECIPIENT_POSITION,
        director_short=forms["director_short"],
        greeting=forms["greeting"],
        intro_text=first("intro_text") or D.INTRO_TEXT,
        section_title=section_title,
        price_header=first("price_header") or D.PRICE_HEADER,
        validity=D.VALIDITY,
        footnotes=_merge_lines([s.footnotes for s in services]),
        extra_text=_merge_lines([s.extra_text for s in services]),
        items=[item_from_service(s) for s in services],
    )
