from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class TaskTypeTemplate(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "task_type_templates"
    __table_args__ = (UniqueConstraint("key", name="uq_task_type_template_key"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(64), nullable=True)
    behavior_json: Mapped[str] = mapped_column(Text, nullable=False)


class TaskType(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "task_types"
    __table_args__ = (
        UniqueConstraint("project_id", "key", name="uq_task_type_project_key"),
        UniqueConstraint("project_id", "name", name="uq_task_type_project_name"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(64), nullable=True)
    behavior_json: Mapped[str] = mapped_column(Text, nullable=False)
    is_default: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
