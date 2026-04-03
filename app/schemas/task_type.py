from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import APIModel


class TaskTypeCreate(BaseModel):
    project_id: str
    key: str
    name: str
    color: str | None = None
    icon: str | None = None
    behavior: dict
    is_default: bool = False


class TaskTypeUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    icon: str | None = None
    behavior: dict | None = None
    is_default: bool | None = None


class TaskTypeRead(APIModel):
    id: str
    project_id: str
    key: str
    name: str
    color: str | None
    icon: str | None
    behavior_json: str
    is_default: int
    created_at: datetime
    updated_at: datetime
