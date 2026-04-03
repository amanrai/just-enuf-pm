from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import APIModel


class TaskPropertyCreate(BaseModel):
    task_id: str
    key: str
    value: str
    value_type: str = "text"


class TaskPropertyUpdate(BaseModel):
    value: str | None = None
    value_type: str | None = None


class TaskPropertyRead(APIModel):
    id: str
    task_id: str
    key: str
    value: str
    value_type: str
    created_at: datetime
    updated_at: datetime
