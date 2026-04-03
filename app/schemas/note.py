from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import APIModel


class NoteCreate(BaseModel):
    entity_type: str
    entity_id: str
    title: str
    content_md: str
    created_by_role: str
    created_by_instance_key: str


class NoteUpdate(BaseModel):
    title: str | None = None
    content_md: str | None = None


class NoteRead(APIModel):
    id: str
    entity_type: str
    entity_id: str
    title: str
    storage_path: str
    created_by_role: str
    created_by_instance_key: str
    created_at: datetime
    updated_at: datetime


class NoteDetail(NoteRead):
    content_md: str
