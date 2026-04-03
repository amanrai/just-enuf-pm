from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import APIModel


class ProjectRepoLinkUpsert(BaseModel):
    remote_url: str


class ProjectRepoLinkRead(APIModel):
    id: str
    project_id: str
    remote_url: str
    repo_subpath: str
    relative_repo_path: str
    absolute_repo_path: str
    clone_status: str
    clone_progress: int
    clone_stage: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime
