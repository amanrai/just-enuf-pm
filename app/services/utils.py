import json
from datetime import datetime, timezone
from uuid import uuid4


def new_id() -> str:
    return str(uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def dumps_json(value: dict) -> str:
    return json.dumps(value, sort_keys=True)


def loads_json(value: str | None, fallback: dict | None = None) -> dict:
    if not value:
        return fallback or {}
    return json.loads(value)
