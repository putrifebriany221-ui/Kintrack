"""Configurable calculation engine. Formulas are NOT hard-coded per indicator;
behaviour is driven by the indicator's `calculation_type` and its stored config."""
from typing import Optional
from formula import safe_eval, FormulaError


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
            zb = (indicator.get("zero_denominator_behavior") or "na").lower()
            if zb == "zero":
                result = 0
                note = "Penyebut = 0 → hasil 0 (sesuai konfigurasi)"
            else:
                result = None
                note = "Penyebut = 0, tidak dapat dihitung (N/A)"
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

    elif ctype == "formula":
        raw = data.get("variables") or {}
        variables = {}
        for k, v in raw.items():
            nv = _to_num(v)
            if nv is not None:
                variables[k] = nv
        formula = indicator.get("formula") or ""
        breakdown = {"variables": variables, "formula": formula}
        if not formula:
            note = "Formula belum dikonfigurasi"
        else:
            try:
                val = safe_eval(formula, variables)
                prec = int(indicator.get("decimal_precision") or 2)
                result = round(float(val), prec)
            except ZeroDivisionError:
                zb = (indicator.get("zero_denominator_behavior") or "na").lower()
                result = 0 if zb == "zero" else None
                note = "Pembagian dengan nol (penyebut = 0)"
            except FormulaError as e:
                note = f"Kesalahan formula: {e}"
            except Exception as e:
                note = f"Kesalahan perhitungan: {e}"

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


def compute_achievement(realization, target, direction="higher_is_better"):
    """Achievement % honouring configurable target direction."""
    r = _to_num(realization)
    t = _to_num(target)
    if r is None or t is None or t == 0:
        return None
    d = (direction or "higher_is_better").lower()
    if d == "lower_is_better":
        if r == 0:
            return None
        return round(t / r * 100, 2)
    if d == "exact_target":
        return round((1 - abs(r - t) / t) * 100, 2)
    return round(r / t * 100, 2)  # higher_is_better


def evaluate_achievement_status(achievement, threshold=100.0):
    if achievement is None:
        return "N/A"
    th = _to_num(threshold)
    if th is None:
        th = 100.0
    return "TERCAPAI" if achievement >= th else "BELUM TERCAPAI"
