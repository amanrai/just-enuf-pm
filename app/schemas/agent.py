from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import APIModel


class AgentCreate(BaseModel):
    key: str
    name: str
    is_enabled: bool = True


class AgentUpdate(BaseModel):
    name: str | None = None
    default_model_id: str | None = None
    is_enabled: bool | None = None


class AgentRead(APIModel):
    id: str
    key: str
    name: str
    default_model_id: str | None
    is_enabled: int
    created_at: datetime
    updated_at: datetime


class AgentModelCreate(BaseModel):
    agent_id: str | None = None
    model_id: str
    label: str | None = None
    is_default: bool = False


class AgentModelUpdate(BaseModel):
    model_id: str | None = None
    label: str | None = None
    is_default: bool | None = None
    is_enabled: bool | None = None


class AgentModelRead(APIModel):
    id: str
    agent_id: str
    model_id: str
    label: str | None
    is_default: int
    is_enabled: int
    created_at: datetime
    updated_at: datetime
