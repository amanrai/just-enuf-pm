from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin, utc_now


class Goal(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "goals"
    __table_args__ = (
        CheckConstraint("length(trim(title)) > 0", name="ck_goal_title_non_empty"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description_md: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_done: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    checklist_items = relationship("GoalChecklistItem", back_populates="goal")


class GoalChecklistItem(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "goal_checklist_items"
    __table_args__ = (
        CheckConstraint("length(trim(title)) > 0", name="ck_goal_checklist_item_title_non_empty"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    goal_id: Mapped[str] = mapped_column(ForeignKey("goals.id", ondelete="RESTRICT"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description_md: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_done: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    display_order: Mapped[int | None] = mapped_column(Integer, nullable=True)

    goal = relationship("Goal", back_populates="checklist_items")


class GoalRelationship(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "goal_relationships"
    __table_args__ = (
        CheckConstraint("source_goal_id != target_goal_id", name="ck_goal_relationship_not_self"),
        CheckConstraint("length(trim(relationship_type)) > 0", name="ck_goal_relationship_type_non_empty"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    source_goal_id: Mapped[str] = mapped_column(ForeignKey("goals.id", ondelete="RESTRICT"), nullable=False)
    target_goal_id: Mapped[str] = mapped_column(ForeignKey("goals.id", ondelete="RESTRICT"), nullable=False)
    relationship_type: Mapped[str] = mapped_column(String(64), nullable=False)


class GoalActivityEvent(Base):
    __tablename__ = "goal_activity_events"
    __table_args__ = (
        CheckConstraint("length(trim(event_type)) > 0", name="ck_goal_activity_event_type_non_empty"),
        CheckConstraint("length(trim(actor_role)) > 0", name="ck_goal_activity_actor_role_non_empty"),
        CheckConstraint("length(trim(actor_instance_key)) > 0", name="ck_goal_activity_actor_instance_key_non_empty"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    goal_id: Mapped[str] = mapped_column(ForeignKey("goals.id", ondelete="RESTRICT"), nullable=False)
    checklist_item_id: Mapped[str | None] = mapped_column(ForeignKey("goal_checklist_items.id", ondelete="SET NULL"), nullable=True)
    event_type: Mapped[str] = mapped_column(String(128), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    actor_role: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_instance_key: Mapped[str] = mapped_column(String(128), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_json: Mapped[str | None] = mapped_column(Text, nullable=True)
