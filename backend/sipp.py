"""Read-only SIPP (MariaDB/MySQL) connector. Configurable at runtime via UI;
no credentials are hard-coded. Enforces SELECT-only queries for safety."""
import re
import aiomysql

FORBIDDEN = re.compile(r"\b(insert|update|delete|drop|alter|create|truncate|replace|grant|revoke|"
                       r"call|lock|unlock|set|use|load|handler|do|rename)\b", re.IGNORECASE)
MULTI_STMT = re.compile(r";\s*\S")


def validate_readonly(sql: str):
    q = (sql or "").strip().rstrip(";").strip()
    if not q:
        raise ValueError("Query kosong")
    low = q.lower()
    if not (low.startswith("select") or low.startswith("with")):
        raise ValueError("Hanya query SELECT yang diizinkan (baca-saja)")
    if MULTI_STMT.search(q + " "):
        raise ValueError("Query ganda (multiple statements) tidak diizinkan")
    if FORBIDDEN.search(q):
        raise ValueError("Query mengandung perintah yang tidak diizinkan (baca-saja)")
    return q


async def _connect(cfg: dict):
    return await aiomysql.connect(
        host=cfg.get("host"), port=int(cfg.get("port") or 3306),
        user=cfg.get("username"), password=cfg.get("password") or "",
        db=cfg.get("database"), connect_timeout=8, autocommit=True,
    )


async def test_connection(cfg: dict) -> dict:
    conn = await _connect(cfg)
    try:
        async with conn.cursor() as cur:
            await cur.execute("SELECT VERSION()")
            row = await cur.fetchone()
            version = row[0] if row else "unknown"
            await cur.execute("SHOW TABLES")
            tables = await cur.fetchall()
        return {"ok": True, "server_version": version, "table_count": len(tables)}
    finally:
        conn.close()


async def run_scalar(cfg: dict, sql: str):
    """Run a validated SELECT and return the first column of the first row as a number."""
    q = validate_readonly(sql)
    conn = await _connect(cfg)
    try:
        async with conn.cursor() as cur:
            await cur.execute(q)
            row = await cur.fetchone()
            if row is None:
                return None
            val = row[0]
            try:
                return float(val)
            except (TypeError, ValueError):
                return val
    finally:
        conn.close()
