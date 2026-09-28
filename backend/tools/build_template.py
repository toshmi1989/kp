"""Сборка мастер-шаблона КП из исходного фирменного бланка.

Берёт реальный документ компании (template_source/base_kp.docx) и расставляет
в нём метки docxtpl (Jinja). Шапка, логотип, подпись директора, шрифты и
оформление таблиц остаются нетронутыми — меняется только текст в местах,
которые заполняются при генерации.

Запуск:  python tools/build_template.py
Результат: templates/kp_master.docx
"""

from __future__ import annotations

import copy
import shutil
import sys
import zipfile
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "template_source" / "base_kp.docx"
DST = ROOT / "templates" / "kp_master.docx"

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W = "{%s}" % W_NS
# отступ таблиц в бланке (w:tblInd) — примечания выравниваем по нему
TABLE_INDENT = -431
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"


# ---------------------------------------------------------------- helpers

def el(tag: str, **attrs) -> etree._Element:
    e = etree.Element(W + tag)
    for k, v in attrs.items():
        e.set(W + k, v)
    return e


def text_runs(p):
    return [r for r in p.iter(W + "r") if r.find(W + "t") is not None]


def set_text(p, text: str, keep_run: int = 0):
    """Заменить текст абзаца, сохранив оформление выбранного run."""
    runs = text_runs(p)
    if not runs:
        raise ValueError("paragraph has no text runs")
    keep = runs[keep_run]
    t = keep.find(W + "t")
    t.text = text
    t.set(XML_SPACE, "preserve")
    for extra in keep.findall(W + "t")[1:]:
        keep.remove(extra)
    for r in runs:
        if r is not keep:
            r.getparent().remove(r)


def ptext(e) -> str:
    return "".join(t.text or "" for t in e.iter(W + "t"))


def ctrl_p(code: str) -> etree._Element:
    """Служебный абзац с тегом {%p ... %} — docxtpl удаляет его при рендере."""
    p = el("p")
    r = etree.SubElement(p, W + "r")
    t = etree.SubElement(r, W + "t")
    t.text = "{%%p %s %%}" % code
    return p


def ctrl_tr(row_template, code: str):
    """Служебная строка таблицы с тегом {%tr ... %}."""
    row = copy.deepcopy(row_template)
    cells = row.findall(W + "tc")
    for tc in cells[1:]:
        row.remove(tc)
    tc = cells[0]
    tcpr = tc.find(W + "tcPr")
    for child in list(tc):
        if child is not tcpr:
            tc.remove(child)
    p = etree.SubElement(tc, W + "p")
    r = etree.SubElement(p, W + "r")
    t = etree.SubElement(r, W + "t")
    t.text = "{%%tr %s %%}" % code
    return row


def simple_p(text: str, *, size=22, bold=False, italic=False, jc=None,
             ind_first=None, ind_left=None, spacing_before=None,
             spacing_after=None, keep_next=False) -> etree._Element:
    p = el("p")
    ppr = etree.SubElement(p, W + "pPr")
    if keep_next:
        etree.SubElement(ppr, W + "keepNext")
    sp = etree.SubElement(ppr, W + "spacing")
    sp.set(W + "before", str(spacing_before or 0))
    sp.set(W + "after", str(spacing_after or 0))
    if ind_first is not None or ind_left is not None:
        ind = etree.SubElement(ppr, W + "ind")
        if ind_left is not None:
            ind.set(W + "left", str(ind_left))
        if ind_first is not None:
            ind.set(W + "firstLine", str(ind_first))
    if jc:
        etree.SubElement(ppr, W + "jc").set(W + "val", jc)
    r = etree.SubElement(p, W + "r")
    rpr = etree.SubElement(r, W + "rPr")
    if bold:
        etree.SubElement(rpr, W + "b")
        etree.SubElement(rpr, W + "bCs")
    if italic:
        etree.SubElement(rpr, W + "i")
        etree.SubElement(rpr, W + "iCs")
    etree.SubElement(rpr, W + "sz").set(W + "val", str(size))
    etree.SubElement(rpr, W + "szCs").set(W + "val", str(size))
    t = etree.SubElement(r, W + "t")
    t.text = text
    t.set(XML_SPACE, "preserve")
    return p


def cell_paragraphs(tc):
    return tc.findall(W + "p")


def set_cell_single_text(tc, text: str, *, bold: bool | None = None,
                         jc: str | None = None):
    """Оставить в ячейке один абзац с заданным текстом."""
    ps = cell_paragraphs(tc)
    first = ps[0]
    for p in ps[1:]:
        tc.remove(p)
    set_text(first, text)
    if bold is not None:
        for rpr in list(first.iter(W + "rPr")):
            for tag in ("b", "bCs"):
                for x in rpr.findall(W + tag):
                    rpr.remove(x)
            if bold:
                rpr.insert(0, el("bCs"))
                rpr.insert(0, el("b"))
    if jc is not None:
        ppr = first.find(W + "pPr")
        old = ppr.find(W + "jc")
        if old is not None:
            ppr.remove(old)
        new = el("jc", val=jc)
        # jc должен идти после ind/spacing, но до rPr
        rpr = ppr.find(W + "rPr")
        if rpr is not None:
            rpr.addprevious(new)
        else:
            ppr.append(new)


# ---------------------------------------------------------------- build

def find_para(body, startswith: str):
    for child in body:
        if child.tag == W + "p" and ptext(child).strip().startswith(startswith):
            return child
    raise LookupError(startswith)


def build(src: Path = SRC, dst: Path = DST) -> Path:
    with zipfile.ZipFile(src) as z:
        xml = z.read("word/document.xml")
    root = etree.fromstring(xml)
    body = root.find(W + "body")

    # --- адресат
    p_pos = find_para(body, "Генеральному")
    set_text(p_pos, "{{ recipient_position }}")
    p_company = p_pos.getnext()
    set_text(p_company, "{{ company }}")
    p_director = p_company.getnext()
    set_text(p_director, "{{ director_short }}")

    # --- обращение и вводный текст
    set_text(find_para(body, "Уважаем"), "{{ greeting }}")
    set_text(find_para(body, "Компания"), "{{ intro_text }}")
    set_text(find_para(body, "СТОИМОСТЬ"), "{{ section_title }}")

    # --- таблица услуг
    tables = body.findall(W + "tbl")
    tbl = tables[0]
    rows = tbl.findall(W + "tr")
    header, group_row, item_row = rows[0], rows[1], rows[2]

    set_cell_single_text(header.findall(W + "tc")[2], "{{ price_header }}")
    set_cell_single_text(group_row.findall(W + "tc")[0], "{{ g.title }}")

    item = copy.deepcopy(item_row)
    tr_pr = item.find(W + "trPr")
    if tr_pr is not None:
        item.remove(tr_pr)
    c_num, c_name, c_price = item.findall(W + "tc")
    set_cell_single_text(c_num, "{{ it.num }}.")
    set_cell_single_text(c_price, "{{ it.price_display }}")

    p_name, p_dur = cell_paragraphs(c_name)[:2]
    for extra in cell_paragraphs(c_name)[2:]:
        c_name.remove(extra)
    set_text(p_name, "{{ it.name }}")
    # описание: абзац с тем же отступом, что у строки «Срок», без курсива
    p_desc = copy.deepcopy(p_dur)
    set_text(p_desc, "{{r it.description_rt }}")
    # срок: «Срок подготовки: » обычным + значение курсивом (как в образце)
    dur_runs = text_runs(p_dur)
    label_run, value_run = dur_runs[0], dur_runs[-1]
    label_run.find(W + "t").text = "{{ it.duration_label }} "
    value_run.find(W + "t").text = "{{ it.duration_text }}"
    for r in dur_runs[1:-1]:
        r.getparent().remove(r)

    p_name.addnext(ctrl_p("if it.description"))
    p_name.getnext().addnext(p_desc)
    p_desc.addnext(ctrl_p("endif"))
    p_desc.getnext().addnext(ctrl_p("if it.duration_text"))
    p_dur.addnext(ctrl_p("endif"))

    for r in rows[1:]:
        tbl.remove(r)
    tbl.append(ctrl_tr(group_row, "for g in groups"))
    tbl.append(ctrl_tr(group_row, "if g.title"))
    tbl.append(group_row)
    tbl.append(ctrl_tr(group_row, "endif"))
    tbl.append(ctrl_tr(group_row, "for it in g.rows"))
    tbl.append(item)
    tbl.append(ctrl_tr(group_row, "endfor"))
    tbl.append(ctrl_tr(group_row, "endfor"))

    # --- примечания под таблицей услуг
    anchor = tbl
    for node in [
        ctrl_p("for note in price_notes"),
        simple_p("{{ note }}", size=20, italic=True, spacing_before=60,
                 ind_left=TABLE_INDENT),
        ctrl_p("endfor"),
    ]:
        anchor.addnext(node)
        anchor = node

    # --- блоки детализации (этапы и сроки)
    st_tbl = copy.deepcopy(tbl)
    st_rows = st_tbl.findall(W + "tr")
    st_header = st_rows[0]
    st_item_src = next(r for r in st_rows if "{{ it.num }}" in ptext(r))
    for r in st_rows[1:]:
        st_tbl.remove(r)
    h_num, h_name, h_dur = st_header.findall(W + "tc")
    set_cell_single_text(h_num, "п/н этапа")
    set_cell_single_text(h_name, "{{ sb.name_header }}")
    set_cell_single_text(h_dur, "{{ sb.duration_header }}")
    # «п/н этапа» переносится, как в образце
    nowrap = h_num.find(W + "tcPr").find(W + "noWrap")
    if nowrap is not None:
        h_num.find(W + "tcPr").remove(nowrap)

    # колонка «п/н этапа» шире, чем «№» в таблице услуг
    grid = st_tbl.find(W + "tblGrid").findall(W + "gridCol")
    grid[0].set(W + "w", "880")
    grid[1].set(W + "w", "6052")
    for row in (st_header, st_item_src):
        cells = row.findall(W + "tc")
        cells[0].find(W + "tcPr").find(W + "tcW").set(W + "w", "450")
        cells[1].find(W + "tcPr").find(W + "tcW").set(W + "w", "3093")

    s_num, s_name, s_dur = st_item_src.findall(W + "tc")
    set_cell_single_text(s_num, "{{ st.num }}.")
    set_cell_single_text(s_name, "{{ st.name }}", bold=False)
    set_cell_single_text(s_dur, "{{ st.duration }}", bold=False, jc="center")
    # абзац названия этапа — выровнять по вертикали по центру ячейки
    tcpr = s_name.find(W + "tcPr")
    if tcpr.find(W + "vAlign") is None:
        tcpr.find(W + "textDirection").addprevious(el("vAlign", val="center"))
    st_tbl.append(ctrl_tr(st_header, "for st in sb.stages"))
    st_tbl.append(st_item_src)
    st_tbl.append(ctrl_tr(st_header, "endfor"))

    block = [
        ctrl_p("for sb in stage_blocks"),
        simple_p("", size=22),
        ctrl_p("if sb.title"),
        simple_p("{{ sb.title }}", size=22, bold=True, jc="center",
                 spacing_after=120, keep_next=True),
        ctrl_p("endif"),
        st_tbl,
        ctrl_p("endfor"),
        # сноски (*При необходимости и т.п.)
        ctrl_p("if footnotes"),
        simple_p("", size=20),
        ctrl_p("endif"),
        ctrl_p("for fn in footnotes"),
        simple_p("{{ fn }}", size=18, ind_left=TABLE_INDENT),
        ctrl_p("endfor"),
        # дополнительные абзацы (условия договора и т.п.)
        ctrl_p("for para in extra_paragraphs"),
        simple_p("{{ para }}", size=22, jc="both", ind_first=709,
                 spacing_before=120),
        ctrl_p("endfor"),
    ]
    for node in block:
        anchor.addnext(node)
        anchor = node

    # --- срок действия
    p_valid = find_para(body, "Коммерческое предложение действует")
    set_text(p_valid, "Коммерческое предложение действует в течение {{ validity }}")
    # срок действия и подпись не разрываются между страницами
    node = p_valid
    while node is not None and node.tag == W + "p":
        ppr = node.find(W + "pPr")
        if ppr is None:
            ppr = el("pPr")
            node.insert(0, ppr)
        if ppr.find(W + "keepNext") is None:
            ppr.insert(0, el("keepNext"))
        node = node.getnext()
    if node is not None and node.tag == W + "tbl":
        for tr in node.findall(W + "tr"):
            trpr = tr.find(W + "trPr")
            if trpr is None:
                trpr = el("trPr")
                tr.insert(0, trpr)
            trpr.append(el("cantSplit"))

    new_xml = etree.tostring(root, xml_declaration=True, encoding="UTF-8",
                             standalone=True)

    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".tmp")
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for info in zin.infolist():
            data = new_xml if info.filename == "word/document.xml" else zin.read(info.filename)
            zout.writestr(info, data)
    shutil.move(tmp, dst)
    return dst


if __name__ == "__main__":
    out = build(Path(sys.argv[1]) if len(sys.argv) > 1 else SRC)
    print(f"Шаблон собран: {out}")
