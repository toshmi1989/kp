"""Русские формы для адресата: пол, дательный падеж, обращение."""

from __future__ import annotations

import re

from pytrovich.detector import PetrovichGenderDetector
from pytrovich.enums import Case, Gender, NamePart
from pytrovich.maker import PetrovichDeclinationMaker

_maker = PetrovichDeclinationMaker()
_detector = PetrovichGenderDetector()

PLACEHOLDER = "______________"


def parse_fio(full: str) -> tuple[str, str, str]:
    """«Иванов Иван Иванович» -> (фамилия, имя, отчество)."""
    parts = [p for p in re.split(r"\s+", (full or "").strip()) if p]
    last = parts[0] if parts else ""
    first = parts[1] if len(parts) > 1 else ""
    middle = " ".join(parts[2:]) if len(parts) > 2 else ""
    return last, first, middle


def detect_gender(first: str, middle: str) -> str:
    m = middle.lower()
    if m.endswith(("вич", "ич", "оглы", "улы", "уулу")):
        return "m"
    if m.endswith(("вна", "чна", "кызы", "гызы", "кизи")):
        return "f"
    if not first:
        return "m"
    try:
        g = _detector.detect(firstname=first)
    except Exception:  # неизвестное имя
        return "m"
    return "f" if g == Gender.FEMALE else "m"


def _initial(name: str) -> str:
    # «Иван» -> «И.», «Анна-Мария» -> «А.-М.»
    return "-".join(p[:1].upper() + "." for p in name.split("-") if p)


def _dative_lastname(last: str, gender: str) -> str:
    if not last or not re.search(r"[а-яё]", last, re.I):
        return last
    g = Gender.FEMALE if gender == "f" else Gender.MALE
    try:
        return _maker.make(NamePart.LASTNAME, g, Case.DATIVE, last)
    except Exception:
        return last


def director_short(full: str, gender: str | None = None) -> str:
    """«Иванов Иван Иванович» -> «Иванову И.И.» (кому)."""
    last, first, middle = parse_fio(full)
    if not last:
        return PLACEHOLDER
    gender = gender or detect_gender(first, middle)
    initials = "".join(_initial(x) for x in (first, middle) if x)
    last_d = _dative_lastname(last, gender)
    return f"{last_d} {initials}".strip()


def greeting(full: str, gender: str | None = None) -> str:
    """«Уважаемый Иван Иванович!» / «Уважаемая Анна Сергеевна!»."""
    last, first, middle = parse_fio(full)
    gender = gender or detect_gender(first, middle)
    word = "Уважаемая" if gender == "f" else "Уважаемый"
    if first:
        name = f"{first} {middle}".strip()
    elif last:
        name = ("госпожа " if gender == "f" else "господин ") + last
    else:
        name = PLACEHOLDER
    return f"{word} {name}!"


_HARD_BEFORE_II = set("кгх")


def _dative_word(word: str) -> tuple[str, bool]:
    """Склонение одного слова должности. Возвращает (форма, это_существительное)."""
    if not re.fullmatch(r"[А-Яа-яЁё-]+", word):
        return word, False
    low = word.lower()
    if low.endswith(("ый", "ой")):
        res, noun = word[:-2] + "ому", False
    elif low.endswith("ий"):
        res = word[:-2] + ("ому" if low[-3:-2] in _HARD_BEFORE_II else "ему")
        noun = False
    elif low.endswith("ая"):
        res, noun = word[:-2] + "ой", False
    elif low.endswith(("ь", "й")):
        res, noun = word[:-1] + "ю", True
    elif low.endswith(("а", "я")):
        res, noun = word[:-1] + "е", True
    elif low[-1] in "бвгджзклмнпрстфхцчшщ":
        res, noun = word + "у", True
    else:
        res, noun = word, True
    if word.isupper():
        res = res.upper()
    return res, noun


def position_dative(position: str) -> str:
    """«Генеральный директор» -> «Генеральному директору».

    Склоняются прилагательные и первое существительное; хвост
    («по развитию», «ООО …») остаётся как есть.
    """
    words = (position or "").split()
    out = []
    done = False
    for w in words:
        if done:
            out.append(w)
            continue
        form, is_noun = _dative_word(w)
        out.append(form)
        if is_noun:
            done = True
    return " ".join(out)


def name_forms(full: str, position: str, gender: str | None = None) -> dict:
    _, first, middle = parse_fio(full)
    g = gender or detect_gender(first, middle)
    return {
        "director_short": director_short(full, g),
        "greeting": greeting(full, g),
        "recipient_position": position_dative(position) if position else "",
        "gender": g,
    }
