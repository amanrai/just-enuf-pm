from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class Project(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    parent_project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    description_md: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_role: Mapped[str] = mapped_column(String(32), nullable=False)
    created_by_instance_key: Mapped[str] = mapped_column(String(128), nullable=False)
