from sqlalchemy import CheckConstraint, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class TaskDependency(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "task_dependencies"
    __table_args__ = (
        UniqueConstraint("blocked_task_id", "blocking_task_id", name="uq_task_dependency_pair"),
        CheckConstraint("blocked_task_id <> blocking_task_id", name="ck_task_dependency_no_self"),
    )

    id: Mapped[str] = mapped_column(primary_key=True)
    blocked_task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    blocking_task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    created_by_role: Mapped[str] = mapped_column(String(32), nullable=False)
    created_by_instance_key: Mapped[str] = mapped_column(String(128), nullable=False)
