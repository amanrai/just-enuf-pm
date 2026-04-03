from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import APIModel
from app.schemas.tag import TagRead


class TaskCreate(BaseModel):
    title: str
    task_type_id: str
    status: str
    created_by_role: str
    created_by_instance_key: str
    project_id: str | None = None
    parent_task_id: str | None = None
    description_md: str | None = None
    tag_names: list[str] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    title: str | None = None
    status: str | None = None
    description_md: str | None = None
    project_id: str | None = None
    parent_task_id: str | None = None
    task_type_id: str | None = None
    tag_names: list[str] | None = None


class TaskReorderRequest(BaseModel):
    task_ids: list[str]


class TaskRead(APIModel):
    id: str
    project_id: str | None
    parent_task_id: str | None
    task_type_id: str
    display_order: int
    title: str
    description_md: str | None
    status: str
    created_by_role: str
    created_by_instance_key: str
    tags: list[TagRead]
    created_at: datetime
    updated_at: datetime
