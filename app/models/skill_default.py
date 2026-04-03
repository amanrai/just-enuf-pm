from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin


class SkillDefault(TimestampMixin, Base):
    __tablename__ = "skill_defaults"

    skill_name: Mapped[str] = mapped_column(String(255), primary_key=True)
    default_agent_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    default_model_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
