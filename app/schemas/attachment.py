from datetime import datetime

from app.schemas.common import APIModel


class AttachmentRead(APIModel):
    id: str
    entity_type: str
    entity_id: str
    file_name: str
    storage_path: str
    content_type: str | None
    size_bytes: int
    created_by_role: str
    created_by_instance_key: str
    created_at: datetime
    updated_at: datetime
