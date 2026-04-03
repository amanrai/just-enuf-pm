from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import APIModel


class CommentCreate(BaseModel):
    author_role: str
    author_instance_key: str
    body_md: str
    body_format: str = "markdown"
    project_id: str | None = None
    task_id: str | None = None
    parent_comment_id: str | None = None


class CommentUpdate(BaseModel):
    body_md: str


class CommentRead(APIModel):
    id: str
    author_role: str
    author_instance_key: str
    body_md: str
    body_format: str
    project_id: str | None
    task_id: str | None
    parent_comment_id: str | None
    is_human_comment: int
    created_at: datetime
    updated_at: datetime
