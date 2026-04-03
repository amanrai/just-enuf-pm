from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import APIModel


class ProjectPropertyCreate(BaseModel):
    project_id: str
    key: str
    value: str
    value_type: str = "text"


class ProjectPropertyUpdate(BaseModel):
    value: str | None = None
    value_type: str | None = None


class ProjectPropertyRead(APIModel):
    id: str
    project_id: str
    key: str
    value: str
    value_type: str
    created_at: datetime
    updated_at: datetime
