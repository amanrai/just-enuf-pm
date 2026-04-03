from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin


class ProjectRepoLink(TimestampMixin, Base):
    __tablename__ = "project_repo_links"
    __table_args__ = (UniqueConstraint("project_id", name="uq_project_repo_link_project"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    remote_url: Mapped[str] = mapped_column(Text, nullable=False)
    repo_subpath: Mapped[str] = mapped_column(String(255), nullable=False)
    clone_status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued")
    clone_progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    clone_stage: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
