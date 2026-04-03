from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class Agent(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    key: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    default_model_id: Mapped[str | None] = mapped_column(String, ForeignKey("agent_models.id"), nullable=True)
    is_enabled: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


class AgentModel(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "agent_models"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id"), nullable=False)
    model_id: Mapped[str] = mapped_column(String(255), nullable=False)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_default: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_enabled: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
