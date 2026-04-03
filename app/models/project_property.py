from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class ProjectProperty(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "project_properties"
    __table_args__ = (UniqueConstraint("project_id", "key", name="uq_project_property_key"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    key: Mapped[str] = mapped_column(String(128), nullable=False)
    value: Mapped[str] = mapped_column(String, nullable=False)
    value_type: Mapped[str] = mapped_column(String(32), nullable=False, default="text")
