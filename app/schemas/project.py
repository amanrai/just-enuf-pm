from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import APIModel


class ProjectCreate(BaseModel):
    name: str
    slug: str
    description_md: str | None = None
    parent_project_id: str | None = None
    created_by_role: str
    created_by_instance_key: str


class ProjectUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    description_md: str | None = None
    parent_project_id: str | None = None


class ProjectRead(APIModel):
    id: str
    parent_project_id: str | None
    name: str
    slug: str
    description_md: str | None
    created_by_role: str
    created_by_instance_key: str
    created_at: datetime
    updated_at: datetime


class ProjectAttach(BaseModel):
    parent_project_id: str
