from datetime import datetime

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.schemas.comment import CommentCreate, CommentRead
from app.schemas.common import SoftDeleteResponse
from app.schemas.goal import (
    ActorPayload,
    GoalActivityEventRead,
    GoalChecklistItemCreate,
    GoalChecklistItemGraduate,
    GoalChecklistItemRead,
    GoalChecklistItemUpdate,
    GoalCreate,
    GoalFullRead,
    GoalRead,
    GoalRelationshipCreate,
    GoalRelationshipRead,
    GoalRelationshipUpdate,
    GoalSearchResult,
    GoalUpdate,
)
from app.services import comments as comment_service
from app.services import goals as goal_service

router = APIRouter(prefix="/api", tags=["goals"])


@router.get("/goals", response_model=list[GoalRead])
def list_goals(
    include_done: bool = Query(default=True),
    include_deleted: bool = Query(default=False),
    done: int | None = Query(default=None),
    updated_since: datetime | None = Query(default=None),
    created_since: datetime | None = Query(default=None),
    q: str | None = Query(default=None),
    session: Session = Depends(get_session),
):
    return goal_service.list_goals(
        session,
        include_done=include_done,
        include_deleted=include_deleted,
        done=done,
        updated_since=updated_since,
        created_since=created_since,
        q=q,
    )


@router.post("/goals", response_model=GoalFullRead, status_code=status.HTTP_201_CREATED)
def create_goal(payload: GoalCreate, session: Session = Depends(get_session)):
    return goal_service.create_goal(session, payload)


@router.get("/goals/full", response_model=list[GoalFullRead])
def list_goals_full(
    include_done: bool = Query(default=True),
    include_deleted: bool = Query(default=False),
    done: int | None = Query(default=None),
    q: str | None = Query(default=None),
    order_by: str = Query(default="created"),
    order_dir: str = Query(default="asc"),
    session: Session = Depends(get_session),
):
    return goal_service.list_goals_full(
        session,
        include_done=include_done,
        include_deleted=include_deleted,
        done=done,
        q=q,
        order_by=order_by,
        order_dir=order_dir,
    )


@router.get("/goals/search", response_model=list[GoalSearchResult])
def search_goals(
    q: str = Query(...),
    include_done: bool = Query(default=True),
    include_deleted: bool = Query(default=False),
    limit: int = Query(default=50),
    session: Session = Depends(get_session),
):
    return goal_service.search_goals(session, q=q, include_done=include_done, include_deleted=include_deleted, limit=limit)


@router.get("/goals/activity", response_model=list[GoalActivityEventRead])
def list_goal_activity(
    since: datetime | None = Query(default=None),
    until: datetime | None = Query(default=None),
    event_type: str | None = Query(default=None),
    goal_id: str | None = Query(default=None),
    limit: int = Query(default=100),
    session: Session = Depends(get_session),
):
    return goal_service.list_activity(session, goal_id=goal_id, since=since, until=until, event_type=event_type, limit=limit)


@router.get("/goals/updated", response_model=list[GoalFullRead])
def list_updated_goals(
    since: datetime | None = Query(default=None),
    until: datetime | None = Query(default=None),
    session: Session = Depends(get_session),
):
    return goal_service.list_updated(session, since=since, until=until)


@router.get("/goals/finished", response_model=list[GoalFullRead])
def list_finished_goals(
    since: datetime | None = Query(default=None),
    until: datetime | None = Query(default=None),
    session: Session = Depends(get_session),
):
    return goal_service.list_finished(session, since=since, until=until)


@router.get("/goals/{goal_id}", response_model=GoalFullRead)
def get_goal(goal_id: str, session: Session = Depends(get_session)):
    return goal_service.get_goal_read(session, goal_id)


@router.patch("/goals/{goal_id}", response_model=GoalFullRead)
def update_goal(goal_id: str, payload: GoalUpdate, session: Session = Depends(get_session)):
    return goal_service.update_goal(session, goal_id, payload)


@router.delete("/goals/{goal_id}", response_model=SoftDeleteResponse)
def delete_goal(goal_id: str, payload: ActorPayload, session: Session = Depends(get_session)):
    return goal_service.delete_goal(session, goal_id, payload)


@router.get("/goals/{goal_id}/activity", response_model=list[GoalActivityEventRead])
def list_one_goal_activity(
    goal_id: str,
    since: datetime | None = Query(default=None),
    until: datetime | None = Query(default=None),
    event_type: str | None = Query(default=None),
    limit: int = Query(default=100),
    session: Session = Depends(get_session),
):
    return goal_service.list_activity(session, goal_id=goal_id, since=since, until=until, event_type=event_type, limit=limit)


@router.get("/goals/{goal_id}/checklist-items", response_model=list[GoalChecklistItemRead])
def list_checklist_items(goal_id: str, include_deleted: bool = Query(default=False), session: Session = Depends(get_session)):
    return goal_service.list_checklist_items(session, goal_id, include_deleted=include_deleted)


@router.post("/goals/{goal_id}/checklist-items", response_model=GoalChecklistItemRead, status_code=status.HTTP_201_CREATED)
def create_checklist_item(goal_id: str, payload: GoalChecklistItemCreate, session: Session = Depends(get_session)):
    return goal_service.create_checklist_item(session, goal_id, payload)


@router.get("/goals/{goal_id}/relationships", response_model=list[GoalRelationshipRead])
def list_goal_relationships(goal_id: str, session: Session = Depends(get_session)):
    return goal_service.list_relationships(session, goal_id=goal_id)


@router.get("/goal-checklist-items/{item_id}", response_model=GoalChecklistItemRead)
def get_checklist_item(item_id: str, session: Session = Depends(get_session)):
    return goal_service.get_checklist_item_read(session, item_id)


@router.patch("/goal-checklist-items/{item_id}", response_model=GoalChecklistItemRead)
def update_checklist_item(item_id: str, payload: GoalChecklistItemUpdate, session: Session = Depends(get_session)):
    return goal_service.update_checklist_item(session, item_id, payload)


@router.delete("/goal-checklist-items/{item_id}", response_model=SoftDeleteResponse)
def delete_checklist_item(item_id: str, payload: ActorPayload, session: Session = Depends(get_session)):
    return goal_service.delete_checklist_item(session, item_id, payload)


@router.post("/goal-checklist-items/{item_id}/graduate", response_model=GoalFullRead, status_code=status.HTTP_201_CREATED)
def graduate_checklist_item(item_id: str, payload: GoalChecklistItemGraduate, session: Session = Depends(get_session)):
    return goal_service.graduate_checklist_item(session, item_id, payload)


@router.get("/goal-checklist-items/{item_id}/comments", response_model=list[CommentRead])
def list_checklist_item_comments(item_id: str, session: Session = Depends(get_session)):
    goal_service.get_checklist_item(session, item_id)
    return comment_service.list_comments(session, goal_checklist_item_id=item_id)


@router.post("/goal-checklist-items/{item_id}/comments", response_model=CommentRead, status_code=status.HTTP_201_CREATED)
def create_checklist_item_comment(item_id: str, payload: CommentCreate, session: Session = Depends(get_session)):
    comment_payload = payload.model_copy(update={"project_id": None, "task_id": None, "goal_checklist_item_id": item_id})
    return comment_service.create_comment(session, comment_payload)


@router.get("/goal-relationships", response_model=list[GoalRelationshipRead])
def list_relationships(goal_id: str | None = Query(default=None), session: Session = Depends(get_session)):
    return goal_service.list_relationships(session, goal_id=goal_id)


@router.post("/goal-relationships", response_model=GoalRelationshipRead, status_code=status.HTTP_201_CREATED)
def create_relationship(payload: GoalRelationshipCreate, session: Session = Depends(get_session)):
    return goal_service.create_relationship(session, payload)


@router.patch("/goal-relationships/{relationship_id}", response_model=GoalRelationshipRead)
def update_relationship(relationship_id: str, payload: GoalRelationshipUpdate, session: Session = Depends(get_session)):
    return goal_service.update_relationship(session, relationship_id, payload)


@router.delete("/goal-relationships/{relationship_id}", response_model=SoftDeleteResponse)
def delete_relationship(relationship_id: str, payload: ActorPayload, session: Session = Depends(get_session)):
    return goal_service.delete_relationship(session, relationship_id, payload)
