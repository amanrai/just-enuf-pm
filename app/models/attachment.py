from sqlalchemy import CheckConstraint, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class Attachment(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "attachments"
    __table_args__ = (
        CheckConstraint("entity_type IN ('project', 'task')", name="ck_attachment_entity_type"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(16), nullable=False)
    entity_id: Mapped[str] = mapped_column(String, nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by_role: Mapped[str] = mapped_column(String(32), nullable=False)
    created_by_instance_key: Mapped[str] = mapped_column(String(128), nullable=False)
