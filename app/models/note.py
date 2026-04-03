from sqlalchemy import CheckConstraint, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class Note(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "notes"
    __table_args__ = (
        CheckConstraint("entity_type IN ('project', 'task')", name="ck_note_entity_type"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(16), nullable=False)
    entity_id: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_role: Mapped[str] = mapped_column(String(32), nullable=False)
    created_by_instance_key: Mapped[str] = mapped_column(String(128), nullable=False)
