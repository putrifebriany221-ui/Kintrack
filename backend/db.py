"""MongoDB connection and shared helpers (relational-style, string UUID primary keys)."""
import os
import uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]


def new_id() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean(doc):
    """Strip Mongo _id from a document (or list of documents)."""
    if doc is None:
        return None
    if isinstance(doc, list):
        return [clean(d) for d in doc]
    doc.pop("_id", None)
    return doc


async def log_audit(user, action, module, record_id="", old_value=None, new_value=None, ip=""):
    """Persist an audit trail entry."""
    entry = {
        "id": new_id(),
        "user_id": (user or {}).get("id", ""),
        "user_name": (user or {}).get("name", "system"),
        "role": (user or {}).get("role", ""),
        "action": action,
        "module": module,
        "record_id": record_id,
        "old_value": old_value,
        "new_value": new_value,
        "ip_address": ip,
        "timestamp": now_iso(),
    }
    await db.audit_logs.insert_one(entry)
    return entry
