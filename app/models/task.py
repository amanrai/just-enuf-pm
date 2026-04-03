from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class Task(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint("project_id IS NOT NULL OR parent_task_id IS NOT NULL", name="ck_task_has_parent"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    parent_task_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    task_type_id: Mapped[str] = mapped_column(ForeignKey("task_types.id"), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description_md: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_role: Mapped[str] = mapped_column(String(32), nullable=False)
    created_by_instance_key: Mapped[str] = mapped_column(String(128), nullable=False)
    tags = relationship("Tag", secondary="task_tags", back_populates="tasks")
