from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import APIModel


class DependencyCreate(BaseModel):
    blocking_task_id: str
    created_by_role: str
    created_by_instance_key: str


class DependencyRead(APIModel):
    id: str
    blocked_task_id: str
    blocking_task_id: str
    created_by_role: str
    created_by_instance_key: str
    created_at: datetime
