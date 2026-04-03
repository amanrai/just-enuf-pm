from datetime import datetime

from pydantic import BaseModel, ConfigDict


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SoftDeleteResponse(APIModel):
    id: str
    deleted_at: datetime
