"""Safe formula evaluator. Evaluates configurable indicator formulas over a
variables dict WITHOUT allowing arbitrary code execution (AST allow-list only)."""
import ast
import operator

class FormulaError(Exception):
    pass

_BIN = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.Mod: operator.mod, ast.Pow: operator.pow,
    ast.FloorDiv: operator.floordiv,
}
_CMP = {
    ast.Eq: operator.eq, ast.NotEq: operator.ne, ast.Lt: operator.lt,
    ast.LtE: operator.le, ast.Gt: operator.gt, ast.GtE: operator.ge,
}


def _fn_if(cond, a, b):
    return a if cond else b


def _num_args(args):
    flat = []
    for a in args:
        if isinstance(a, (list, tuple)):
            flat.extend(a)
        else:
            flat.append(a)
    return [x for x in flat if isinstance(x, (int, float)) and not isinstance(x, bool)]


_FUNCS = {
    "IF": _fn_if,
    "SUM": lambda *a: sum(_num_args(a)),
    "AVG": lambda *a: (sum(_num_args(a)) / len(_num_args(a))) if _num_args(a) else 0,
    "MIN": lambda *a: min(_num_args(a)) if _num_args(a) else 0,
    "MAX": lambda *a: max(_num_args(a)) if _num_args(a) else 0,
    "ROUND": lambda x, n=0: round(float(x), int(n)),
    "ABS": lambda x: abs(x),
}


def _eval(node, variables):
    if isinstance(node, ast.Expression):
        return _eval(node.body, variables)
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float, bool)):
            return node.value
        raise FormulaError("Konstanta tidak diizinkan")
    if isinstance(node, ast.Name):
        if node.id in variables:
            return variables[node.id]
        raise FormulaError(f"Variabel '{node.id}' tidak ditemukan")
    if isinstance(node, ast.BinOp) and type(node.op) in _BIN:
        return _BIN[type(node.op)](_eval(node.left, variables), _eval(node.right, variables))
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        v = _eval(node.operand, variables)
        return v if isinstance(node.op, ast.UAdd) else -v
    if isinstance(node, ast.BoolOp):
        vals = [_eval(v, variables) for v in node.values]
        return all(vals) if isinstance(node.op, ast.And) else any(vals)
    if isinstance(node, ast.Compare):
        left = _eval(node.left, variables)
        for op, comp in zip(node.ops, node.comparators):
            if type(op) not in _CMP:
                raise FormulaError("Operator perbandingan tidak diizinkan")
            right = _eval(comp, variables)
            if not _CMP[type(op)](left, right):
                return False
            left = right
        return True
    if isinstance(node, ast.IfExp):
        return _eval(node.body, variables) if _eval(node.test, variables) else _eval(node.orelse, variables)
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in _FUNCS:
            raise FormulaError("Fungsi tidak diizinkan")
        # IF must short-circuit: only evaluate the taken branch (guards div-by-zero).
        if node.func.id == "IF":
            if len(node.args) != 3:
                raise FormulaError("IF butuh 3 argumen: IF(kondisi, nilai_benar, nilai_salah)")
            cond = _eval(node.args[0], variables)
            return _eval(node.args[1], variables) if cond else _eval(node.args[2], variables)
        args = [_eval(a, variables) for a in node.args]
        try:
            return _FUNCS[node.func.id](*args)
        except ZeroDivisionError:
            raise
        except Exception as e:
            raise FormulaError(f"Kesalahan fungsi {node.func.id}: {e}")
    raise FormulaError("Ekspresi tidak diizinkan")


def safe_eval(formula: str, variables: dict):
    """Evaluate `formula` with `variables`. Raises FormulaError / ZeroDivisionError.
    Single '=' is treated as equality (spec style: IF(total=0, ...))."""
    if not formula or not str(formula).strip():
        raise FormulaError("Formula kosong")
    import re
    normalized = re.sub(r"(?<![=<>!])=(?!=)", "==", str(formula))
    try:
        tree = ast.parse(normalized, mode="eval")
    except SyntaxError as e:
        raise FormulaError(f"Sintaks formula tidak valid: {e.msg}")
    return _eval(tree, variables or {})
