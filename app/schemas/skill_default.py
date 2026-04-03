from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import APIModel


class SkillDefaultUpdate(BaseModel):
    default_agent_key: str | None = None
    default_model_id: str | None = None


class SkillDefaultRead(APIModel):
    skill_name: str
    default_agent_key: str | None
    default_model_id: str | None
    created_at: datetime
    updated_at: datetime
