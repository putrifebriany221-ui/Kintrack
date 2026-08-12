"""Configurable calculation engine. Formulas are NOT hard-coded per indicator;
behaviour is driven by the indicator's `calculation_type` and its stored config."""
from typing import Optional


def _to_num(v):
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (ValueError, TypeError):
        return None


def compute(indicator: dict, data: dict) -> dict:
    """Return a calculation snapshot dict. Never raises on bad denominators."""
    ctype = indicator.get("calculation_type") or indicator.get("indicator_type") or "manual"
    ctype = ctype.lower()
    result: Optional[float] = None
    breakdown = {}
    note = ""

    if ctype in ("percentage", "ratio"):
        num = _to_num((data.get("numerator") or {}).get("value"))
        den = _to_num((data.get("denominator") or {}).get("value"))
        breakdown = {"numerator": num, "denominator": den}
        if den is None or num is None:
            note = "Data pembilang/penyebut belum lengkap"
        elif den == 0:
            note = "Penyebut = 0, tidak dapat dihitung (N/A)"
            result = None
        else:
            result = round(num / den * (100 if ctype == "percentage" else 1), 2)

    elif ctype in ("composite", "composite_index", "weighted_score"):
        comps = data.get("components") or indicator.get("components") or []
        total = 0.0
        total_weight = 0.0
        rows = []
        for c in comps:
            score = _to_num(c.get("score"))
            weight = _to_num(c.get("weight")) or 0.0
            total_weight += weight
            contribution = None
            if score is not None:
                contribution = round(score * weight / 100.0, 4)
                total += contribution
            rows.append({
                "name": c.get("name"),
                "group": c.get("group"),
                "score": score,
                "weight": weight,
                "contribution": contribution,
            })
        adjustment = _to_num(data.get("adjustment")) or 0.0
        any_score = any(_to_num(c.get("score")) is not None for c in comps)
        if comps and any_score:
            result = round(total + adjustment, 2)
        breakdown = {"components": rows, "adjustment": adjustment, "total_weight": total_weight}
        if abs(total_weight - 100) > 0.01:
            note = f"Peringatan: total bobot komponen = {total_weight}%, bukan 100%"

    elif ctype in ("survey", "survey_index"):
        survey = data.get("survey") or {}
        manual_index = _to_num(survey.get("manual_index"))
        questions = survey.get("questions") or []
        scores = [_to_num(q.get("score")) for q in questions if _to_num(q.get("score")) is not None]
        if manual_index is not None:
            result = round(manual_index, 2)
            note = "Indeks dientri manual"
        elif scores:
            result = round(sum(scores) / len(scores), 2)
        breakdown = {
            "respondents": survey.get("respondents"),
            "questions": questions,
            "manual_index": manual_index,
        }

    else:  # manual, count, score
        m = data.get("manual") or {}
        result = _to_num(m.get("value"))
        breakdown = {"value": result, "source": m.get("source"), "notes": m.get("notes")}

    return {"result": result, "breakdown": breakdown, "note": note, "calculation_type": ctype}


def evaluate_status(result, target, operator) -> str:
    """Return ACHIEVED / NOT_ACHIEVED / N/A based on configurable target logic."""
    if result is None:
        return "N/A"
    t = _to_num(target)
    op = operator or ">="
    if op == "between":
        lo = _to_num((target or {}).get("min") if isinstance(target, dict) else None)
        hi = _to_num((target or {}).get("max") if isinstance(target, dict) else None)
        if lo is None or hi is None:
            return "N/A"
        return "ACHIEVED" if lo <= result <= hi else "NOT_ACHIEVED"
    if t is None:
        return "N/A"
    checks = {
        ">=": result >= t,
        ">": result > t,
        "=": abs(result - t) < 1e-9,
        "<=": result <= t,
        "<": result < t,
    }
    return "ACHIEVED" if checks.get(op, result >= t) else "NOT_ACHIEVED"


def compute_gap(result, target):
    r = _to_num(result)
    t = _to_num(target)
    if r is None or t is None:
        return None
    return round(r - t, 2)
