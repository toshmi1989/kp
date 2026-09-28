"""Генерация .docx из мастер-шаблона.

Входные данные — «снимок» КП (ProposalData). Всё, что видит и правит менеджер
в предпросмотре, приходит сюда как есть; здесь только раскладка по блокам
шаблона и форматирование цены.
"""

from __future__ import annotations

import io
import re
from decimal import Decimal, InvalidOperation
from pathlib import Path

from docxtpl import DocxTemplate, RichText

from .schemas import ProposalData

TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "templates" / "kp_master.docx"

_BOLD_RE = re.compile(r"\*\*(.+?)\*\*", re.S)


def format_price(value: Decimal | float | str | None) -> str:
    """150000 -> «150 000», 1500.5 -> «1 500,50» (неразрывные пробелы)."""
    if value is None or value == "":
        return ""
    try:
        d = Decimal(str(value))
    except InvalidOperation:
        return str(value)
    if d == d.to_integral_value():
        s = f"{int(d):,}".replace(",", " ")
    else:
        s = f"{d:,.2f}".replace(",", " ").replace(".", ",")
    return s


def price_display(price, price_text: str | None, unit: str | None) -> str:
    """Текст для колонки «Стоимость».

    price_text (если задан) имеет приоритет — например, «по запросу»
    или «от 500 000». Единица добавляется через «/», как в образцах.
    """
    main = (price_text or "").strip() or format_price(price)
    unit = (unit or "").strip()
    if main and unit:
        return f"{main} / {unit}"
    return main or unit


def rich_text(text: str | None, size: int = 20) -> RichText:
    """Текст описания: переносы строк сохраняются, **жирный** выделяется."""
    rt = RichText()
    if not text:
        return rt
    pos = 0
    for m in _BOLD_RE.finditer(text):
        if m.start() > pos:
            rt.add(text[pos:m.start()], size=size)
        rt.add(m.group(1), bold=True, size=size)
        pos = m.end()
    if pos < len(text):
        rt.add(text[pos:], size=size)
    return rt


def _lines(text: str | None) -> list[str]:
    return [ln.strip() for ln in (text or "").splitlines() if ln.strip()]


def build_context(data: ProposalData) -> dict:
    groups: list[dict] = []
    num = 0
    for item in data.items:
        title = (item.table_group or "").strip()
        if not groups or groups[-1]["title"] != title:
            groups.append({"title": title, "rows": []})
        num += 1
        groups[-1]["rows"].append({
            "num": num,
            "name": item.name,
            "description": bool((item.description or "").strip()),
            "description_rt": rich_text(item.description),
            "duration_label": (item.duration_label or "").strip(),
            "duration_text": (item.duration_text or "").strip(),
            "price_display": price_display(item.price, item.price_text, item.price_unit),
        })

    stage_blocks = []
    price_notes: list[str] = []
    for item in data.items:
        if item.price_note and item.price_note.strip() not in price_notes:
            price_notes.append(item.price_note.strip())
        if item.show_stages and item.stages:
            stage_blocks.append({
                "title": (item.stages_title or "").strip(),
                "name_header": item.stages_name_header or "Перечень оказываемых услуг",
                "duration_header": item.stages_duration_header or "Срок, рабочие дни",
                "stages": [
                    {"num": i, "name": s.name, "duration": s.duration or ""}
                    for i, s in enumerate(item.stages, start=1)
                ],
            })

    return {
        "recipient_position": data.recipient_position,
        "company": data.company,
        "director_short": data.director_short,
        "greeting": data.greeting,
        "intro_text": data.intro_text,
        "section_title": data.section_title,
        "price_header": data.price_header,
        "groups": groups,
        "price_notes": price_notes,
        "stage_blocks": stage_blocks,
        "footnotes": _lines(data.footnotes),
        "extra_paragraphs": _lines(data.extra_text),
        "validity": data.validity,
    }


def render_docx(data: ProposalData, template_path: Path = TEMPLATE_PATH) -> bytes:
    tpl = DocxTemplate(str(template_path))
    tpl.render(build_context(data), autoescape=True)
    buf = io.BytesIO()
    tpl.save(buf)
    return buf.getvalue()
