from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.comment import CommentCreate, CommentRead
from app.schemas.common import APIModel


class ActorPayload(BaseModel):
    actor_role: str
    actor_instance_key: str


class GoalChecklistItemCreate(ActorPayload):
    title: str
    description_md: str | None = None
    is_done: int | None = None
    completed_at: datetime | None = None
    display_order: int | None = None


class GoalChecklistItemInitial(BaseModel):
    title: str
    description_md: str | None = None
    is_done: int | None = None
    completed_at: datetime | None = None
    display_order: int | None = None


class GoalChecklistItemUpdate(ActorPayload):
    title: str | None = None
    description_md: str | None = None
    is_done: int | None = None
    completed_at: datetime | None = None
    display_order: int | None = None


class GoalCreate(ActorPayload):
    title: str
    description_md: str | None = None
    is_done: int | None = None
    completed_at: datetime | None = None
    checklist_items: list[GoalChecklistItemInitial] = Field(default_factory=list)


class GoalUpdate(ActorPayload):
    title: str | None = None
    description_md: str | None = None
    is_done: int | None = None
    completed_at: datetime | None = None


class GoalChecklistItemRead(APIModel):
    id: str
    goal_id: str
    title: str
    description_md: str | None
    is_done: int
    completed_at: datetime | None
    display_order: int | None
    created_at: datetime
    updated_at: datetime


class GoalRead(APIModel):
    id: str
    title: str
    description_md: str | None
    is_done: int
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    last_updated_at: datetime | None = None
    last_worked_on_at: datetime | None = None


class GoalFullRead(GoalRead):
    checklist_items: list[GoalChecklistItemRead] = Field(default_factory=list)


class GoalDeletedRead(GoalRead):
    deleted_at: datetime


class GoalChecklistItemDeletedRead(GoalChecklistItemRead):
    deleted_at: datetime


class GoalRelationshipCreate(ActorPayload):
    source_goal_id: str
    target_goal_id: str
    relationship_type: str = "supports"


class GoalRelationshipUpdate(ActorPayload):
    relationship_type: str | None = None


class GoalRelationshipRead(APIModel):
    id: str
    source_goal_id: str
    target_goal_id: str
    relationship_type: str
    created_at: datetime
    updated_at: datetime


class GoalActivityEventRead(APIModel):
    id: str
    goal_id: str
    checklist_item_id: str | None
    event_type: str
    occurred_at: datetime
    actor_role: str
    actor_instance_key: str
    summary: str | None
    data: dict[str, Any] | None = None


class GoalChecklistItemGraduate(ActorPayload):
    target: str = "top_level"  # top_level | sub_goal
    relationship_type: str = "supports"


class GoalSearchMatch(APIModel):
    match_type: str
    field: str
    checklist_item_id: str | None = None
    snippet: str | None = None


class GoalSearchResult(APIModel):
    goal: GoalFullRead
    matches: list[GoalSearchMatch]


class GoalChecklistItemCommentCreate(CommentCreate):
    goal_checklist_item_id: str | None = None
