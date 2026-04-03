from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import APIModel


class TagCreate(BaseModel):
    name: str


class TagRead(APIModel):
    id: str
    name: str
    created_at: datetime
    updated_at: datetime
