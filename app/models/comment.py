from sqlalchemy import CheckConstraint, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class Comment(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "comments"
    __table_args__ = (
        CheckConstraint(
            "(project_id IS NOT NULL AND task_id IS NULL) OR (project_id IS NULL AND task_id IS NOT NULL)",
            name="ck_comment_single_target",
        ),
    )

    id: Mapped[str] = mapped_column(primary_key=True)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    task_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    parent_comment_id: Mapped[str | None] = mapped_column(ForeignKey("comments.id"), nullable=True)
    author_role: Mapped[str] = mapped_column(Text, nullable=False)
    author_instance_key: Mapped[str] = mapped_column(Text, nullable=False)
    body_md: Mapped[str] = mapped_column(Text, nullable=False)
    body_format: Mapped[str] = mapped_column(Text, nullable=False, default="markdown")
    is_human_comment: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
