import json
from datetime import datetime
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.comment import Comment
from app.models.goal import Goal, GoalActivityEvent, GoalChecklistItem, GoalRelationship
from app.models.mixins import utc_now
from app.schemas.goal import (
    ActorPayload,
    GoalChecklistItemCreate,
    GoalChecklistItemGraduate,
    GoalChecklistItemInitial,
    GoalChecklistItemUpdate,
    GoalCreate,
    GoalRelationshipCreate,
    GoalRelationshipUpdate,
    GoalUpdate,
)
from app.services.base import active, get_or_404, soft_delete
from app.services.errors import ValidationError
from app.services.utils import new_id

CANONICAL_RELATIONSHIP_TYPE = "supports"


def _validate_title(title: str, entity_name: str = "Title") -> str:
    if not title or not title.strip():
        raise ValidationError(f"{entity_name} must be non-empty")
    return title


def _actor(payload: ActorPayload) -> tuple[str, str]:
    if not payload.actor_role.strip() or not payload.actor_instance_key.strip():
        raise ValidationError("actor_role and actor_instance_key are required")
    return payload.actor_role, payload.actor_instance_key


def _sync_completion(entity, data: dict) -> None:
    if "is_done" in data:
        entity.is_done = int(bool(data["is_done"]))
        if entity.is_done and data.get("completed_at") is None:
            entity.completed_at = utc_now()
        elif not entity.is_done:
            entity.completed_at = None
    if "completed_at" in data and data["completed_at"] is not None:
        entity.completed_at = data["completed_at"]
        entity.is_done = 1


def _event_data(data: dict[str, Any] | None) -> str | None:
    if data is None:
        return None
    return json.dumps(data, default=str, sort_keys=True)


def create_activity_event(
    session: Session,
    *,
    goal_id: str,
    event_type: str,
    actor_role: str,
    actor_instance_key: str,
    checklist_item_id: str | None = None,
    summary: str | None = None,
    data: dict[str, Any] | None = None,
) -> GoalActivityEvent:
    event = GoalActivityEvent(
        id=new_id(),
        goal_id=goal_id,
        checklist_item_id=checklist_item_id,
        event_type=event_type,
        actor_role=actor_role,
        actor_instance_key=actor_instance_key,
        summary=summary,
        data_json=_event_data(data),
    )
    session.add(event)
    return event


def _event_read(event: GoalActivityEvent) -> dict:
    return {
        "id": event.id,
        "goal_id": event.goal_id,
        "checklist_item_id": event.checklist_item_id,
        "event_type": event.event_type,
        "occurred_at": event.occurred_at,
        "actor_role": event.actor_role,
        "actor_instance_key": event.actor_instance_key,
        "summary": event.summary,
        "data": json.loads(event.data_json) if event.data_json else None,
    }


def _latest_event_times(session: Session, goal_ids: list[str]) -> tuple[dict[str, datetime], dict[str, datetime]]:
    if not goal_ids:
        return {}, {}
    events = list(
        session.scalars(
            select(GoalActivityEvent)
            .where(GoalActivityEvent.goal_id.in_(goal_ids))
            .order_by(GoalActivityEvent.occurred_at)
        )
    )
    last_updated: dict[str, datetime] = {}
    last_worked: dict[str, datetime] = {}
    for event in events:
        last_updated[event.goal_id] = event.occurred_at
        if event.checklist_item_id is not None or event.event_type.startswith("checklist_item_"):
            last_worked[event.goal_id] = event.occurred_at
    return last_updated, last_worked


def _serialize_checklist_item(item: GoalChecklistItem) -> dict:
    return {
        "id": item.id,
        "goal_id": item.goal_id,
        "title": item.title,
        "description_md": item.description_md,
        "is_done": item.is_done,
        "completed_at": item.completed_at,
        "display_order": item.display_order,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "deleted_at": item.deleted_at,
    }


def _serialize_goal(goal: Goal, *, last_updated_at: datetime | None = None, last_worked_on_at: datetime | None = None) -> dict:
    return {
        "id": goal.id,
        "title": goal.title,
        "description_md": goal.description_md,
        "is_done": goal.is_done,
        "completed_at": goal.completed_at,
        "created_at": goal.created_at,
        "updated_at": goal.updated_at,
        "deleted_at": goal.deleted_at,
        "last_updated_at": last_updated_at,
        "last_worked_on_at": last_worked_on_at,
    }


def _serialize_goal_full(
    goal: Goal,
    items_by_goal: dict[str, list[GoalChecklistItem]],
    *,
    last_updated_at: datetime | None = None,
    last_worked_on_at: datetime | None = None,
) -> dict:
    data = _serialize_goal(goal, last_updated_at=last_updated_at, last_worked_on_at=last_worked_on_at)
    data["checklist_items"] = [_serialize_checklist_item(item) for item in items_by_goal.get(goal.id, [])]
    return data


def _list_items_for_goals(session: Session, goal_ids: list[str], include_deleted: bool = False) -> dict[str, list[GoalChecklistItem]]:
    if not goal_ids:
        return {}
    stmt = select(GoalChecklistItem).where(GoalChecklistItem.goal_id.in_(goal_ids)).order_by(GoalChecklistItem.display_order, GoalChecklistItem.created_at)
    if not include_deleted:
        stmt = active(stmt, GoalChecklistItem)
    items = list(session.scalars(stmt))
    by_goal: dict[str, list[GoalChecklistItem]] = {goal_id: [] for goal_id in goal_ids}
    for item in items:
        by_goal.setdefault(item.goal_id, []).append(item)
    return by_goal


def get_goal(session: Session, goal_id: str) -> Goal:
    return get_or_404(session, Goal, goal_id, "Goal not found")


def get_goal_any(session: Session, goal_id: str) -> Goal:
    goal = session.scalar(select(Goal).where(Goal.id == goal_id))
    if goal is None:
        raise ValidationError("Goal not found")
    return goal


def get_checklist_item(session: Session, item_id: str) -> GoalChecklistItem:
    item = session.scalar(
        select(GoalChecklistItem)
        .join(Goal, Goal.id == GoalChecklistItem.goal_id)
        .where(GoalChecklistItem.id == item_id, GoalChecklistItem.is_deleted == 0, Goal.is_deleted == 0)
    )
    if item is None:
        from app.services.errors import NotFoundError

        raise NotFoundError("Goal checklist item not found")
    return item


def get_checklist_item_read(session: Session, item_id: str) -> dict:
    return _serialize_checklist_item(get_checklist_item(session, item_id))


def list_goals(
    session: Session,
    *,
    include_done: bool = True,
    include_deleted: bool = False,
    done: int | None = None,
    updated_since: datetime | None = None,
    created_since: datetime | None = None,
    q: str | None = None,
) -> list[dict]:
    stmt = select(Goal).order_by(Goal.created_at)
    if not include_deleted:
        stmt = active(stmt, Goal)
    if not include_done:
        stmt = stmt.where(Goal.is_done == 0)
    if done is not None:
        stmt = stmt.where(Goal.is_done == int(bool(done)))
    if created_since is not None:
        stmt = stmt.where(Goal.created_at >= created_since)
    if updated_since is not None:
        stmt = stmt.where(Goal.updated_at >= updated_since)
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(Goal.title.ilike(pattern), Goal.description_md.ilike(pattern)))
    goals = list(session.scalars(stmt))
    last_updated, last_worked = _latest_event_times(session, [goal.id for goal in goals])
    return [_serialize_goal(goal, last_updated_at=last_updated.get(goal.id), last_worked_on_at=last_worked.get(goal.id)) for goal in goals]


def list_goals_full(
    session: Session,
    *,
    include_done: bool = True,
    include_deleted: bool = False,
    done: int | None = None,
    q: str | None = None,
    order_by: str = "created",
    order_dir: str = "asc",
) -> list[dict]:
    goals = list_goals(session, include_done=include_done, include_deleted=include_deleted, done=done)
    goal_ids = [goal["id"] for goal in goals]
    orm_goals = {goal.id: goal for goal in session.scalars(select(Goal).where(Goal.id.in_(goal_ids)))} if goal_ids else {}
    items_by_goal = _list_items_for_goals(session, goal_ids, include_deleted=include_deleted)
    last_updated, last_worked = _latest_event_times(session, goal_ids)
    rows = [
        _serialize_goal_full(orm_goals[goal_id], items_by_goal, last_updated_at=last_updated.get(goal_id), last_worked_on_at=last_worked.get(goal_id))
        for goal_id in goal_ids
        if goal_id in orm_goals
    ]
    if q:
        needle = q.strip().lower()
        rows = [row for row in rows if _goal_full_matches(row, needle)]
    reverse = order_dir.lower() == "desc"
    if order_by == "updated":
        rows.sort(key=lambda row: row["last_updated_at"] or row["updated_at"], reverse=reverse)
    elif order_by == "worked_on":
        rows.sort(key=lambda row: row["last_worked_on_at"] or row["created_at"], reverse=reverse)
    elif order_by == "title":
        rows.sort(key=lambda row: row["title"].lower(), reverse=reverse)
    elif order_by == "completed":
        rows.sort(key=lambda row: row["completed_at"] or row["created_at"], reverse=reverse)
    else:
        rows.sort(key=lambda row: row["created_at"], reverse=reverse)
    return rows


def _goal_full_matches(row: dict, needle: str) -> bool:
    haystacks = [row["title"], row.get("description_md") or ""]
    for item in row.get("checklist_items", []):
        haystacks.extend([item["title"], item.get("description_md") or ""])
    return any(needle in value.lower() for value in haystacks)


def get_goal_read(session: Session, goal_id: str) -> dict:
    goal = get_goal(session, goal_id)
    items_by_goal = _list_items_for_goals(session, [goal.id])
    last_updated, last_worked = _latest_event_times(session, [goal.id])
    return _serialize_goal_full(goal, items_by_goal, last_updated_at=last_updated.get(goal.id), last_worked_on_at=last_worked.get(goal.id))


def create_goal(session: Session, payload: GoalCreate) -> dict:
    actor_role, actor_instance_key = _actor(payload)
    _validate_title(payload.title, "Goal title")
    goal = Goal(id=new_id(), title=payload.title, description_md=payload.description_md)
    data = payload.model_dump(exclude={"actor_role", "actor_instance_key", "checklist_items", "title", "description_md"}, exclude_unset=True)
    _sync_completion(goal, data)
    session.add(goal)
    session.flush()
    create_activity_event(session, goal_id=goal.id, event_type="goal_created", actor_role=actor_role, actor_instance_key=actor_instance_key, summary=f"Created goal: {goal.title}")
    for item_payload in payload.checklist_items:
        _create_checklist_item(session, goal.id, item_payload, actor_role=actor_role, actor_instance_key=actor_instance_key, commit=False)
    session.commit()
    return get_goal_read(session, goal.id)


def update_goal(session: Session, goal_id: str, payload: GoalUpdate) -> dict:
    actor_role, actor_instance_key = _actor(payload)
    goal = get_goal(session, goal_id)
    data = payload.model_dump(exclude={"actor_role", "actor_instance_key"}, exclude_unset=True)
    changed_fields = list(data)
    if "title" in data:
        _validate_title(data["title"], "Goal title")
    for field, value in data.items():
        if field in {"is_done", "completed_at"}:
            continue
        setattr(goal, field, value)
    _sync_completion(goal, data)
    event_type = "goal_completed" if "is_done" in data and goal.is_done else "goal_updated"
    if "is_done" in data and not goal.is_done:
        event_type = "goal_reopened"
    create_activity_event(session, goal_id=goal.id, event_type=event_type, actor_role=actor_role, actor_instance_key=actor_instance_key, summary=f"Updated goal: {goal.title}", data={"changed_fields": changed_fields})
    session.commit()
    return get_goal_read(session, goal.id)


def delete_goal(session: Session, goal_id: str, payload: ActorPayload) -> dict:
    actor_role, actor_instance_key = _actor(payload)
    goal = get_goal(session, goal_id)
    soft_delete(goal)
    create_activity_event(session, goal_id=goal.id, event_type="goal_deleted", actor_role=actor_role, actor_instance_key=actor_instance_key, summary=f"Deleted goal: {goal.title}")
    session.commit()
    session.refresh(goal)
    return _serialize_goal(goal)


def list_checklist_items(session: Session, goal_id: str, include_deleted: bool = False) -> list[dict]:
    get_goal(session, goal_id)
    return [_serialize_checklist_item(item) for item in _list_items_for_goals(session, [goal_id], include_deleted=include_deleted).get(goal_id, [])]


def _create_checklist_item(
    session: Session,
    goal_id: str,
    payload: GoalChecklistItemCreate | GoalChecklistItemInitial,
    *,
    actor_role: str,
    actor_instance_key: str,
    commit: bool = True,
) -> GoalChecklistItem:
    _validate_title(payload.title, "Checklist item title")
    item = GoalChecklistItem(id=new_id(), goal_id=goal_id, title=payload.title, description_md=payload.description_md, display_order=payload.display_order)
    data = payload.model_dump(exclude={"actor_role", "actor_instance_key", "title", "description_md", "display_order"}, exclude_unset=True)
    _sync_completion(item, data)
    session.add(item)
    session.flush()
    create_activity_event(session, goal_id=goal_id, checklist_item_id=item.id, event_type="checklist_item_created", actor_role=actor_role, actor_instance_key=actor_instance_key, summary=f"Created checklist item: {item.title}")
    if commit:
        session.commit()
        session.refresh(item)
    return item


def create_checklist_item(session: Session, goal_id: str, payload: GoalChecklistItemCreate) -> dict:
    get_goal(session, goal_id)
    actor_role, actor_instance_key = _actor(payload)
    item = _create_checklist_item(session, goal_id, payload, actor_role=actor_role, actor_instance_key=actor_instance_key)
    return _serialize_checklist_item(item)


def update_checklist_item(session: Session, item_id: str, payload: GoalChecklistItemUpdate) -> dict:
    actor_role, actor_instance_key = _actor(payload)
    item = get_checklist_item(session, item_id)
    data = payload.model_dump(exclude={"actor_role", "actor_instance_key"}, exclude_unset=True)
    changed_fields = list(data)
    if "title" in data:
        _validate_title(data["title"], "Checklist item title")
    for field, value in data.items():
        if field in {"is_done", "completed_at"}:
            continue
        setattr(item, field, value)
    _sync_completion(item, data)
    event_type = "checklist_item_completed" if "is_done" in data and item.is_done else "checklist_item_updated"
    if "is_done" in data and not item.is_done:
        event_type = "checklist_item_reopened"
    create_activity_event(session, goal_id=item.goal_id, checklist_item_id=item.id, event_type=event_type, actor_role=actor_role, actor_instance_key=actor_instance_key, summary=f"Updated checklist item: {item.title}", data={"changed_fields": changed_fields})
    session.commit()
    session.refresh(item)
    return _serialize_checklist_item(item)


def delete_checklist_item(session: Session, item_id: str, payload: ActorPayload) -> dict:
    actor_role, actor_instance_key = _actor(payload)
    item = get_checklist_item(session, item_id)
    soft_delete(item)
    create_activity_event(session, goal_id=item.goal_id, checklist_item_id=item.id, event_type="checklist_item_deleted", actor_role=actor_role, actor_instance_key=actor_instance_key, summary=f"Deleted checklist item: {item.title}")
    session.commit()
    session.refresh(item)
    return _serialize_checklist_item(item)


def create_relationship(session: Session, payload: GoalRelationshipCreate) -> dict:
    actor_role, actor_instance_key = _actor(payload)
    get_goal(session, payload.source_goal_id)
    get_goal(session, payload.target_goal_id)
    if payload.source_goal_id == payload.target_goal_id:
        raise ValidationError("Goal relationship cannot target itself")
    relationship_type = payload.relationship_type.strip() or CANONICAL_RELATIONSHIP_TYPE
    rel = GoalRelationship(id=new_id(), source_goal_id=payload.source_goal_id, target_goal_id=payload.target_goal_id, relationship_type=relationship_type)
    session.add(rel)
    create_activity_event(session, goal_id=payload.source_goal_id, event_type="goal_relationship_created", actor_role=actor_role, actor_instance_key=actor_instance_key, data={"relationship_id": rel.id, "target_goal_id": rel.target_goal_id, "relationship_type": relationship_type})
    create_activity_event(session, goal_id=payload.target_goal_id, event_type="goal_relationship_created", actor_role=actor_role, actor_instance_key=actor_instance_key, data={"relationship_id": rel.id, "source_goal_id": rel.source_goal_id, "relationship_type": relationship_type})
    session.commit()
    session.refresh(rel)
    return _serialize_relationship(rel)


def _serialize_relationship(rel: GoalRelationship) -> dict:
    return {"id": rel.id, "source_goal_id": rel.source_goal_id, "target_goal_id": rel.target_goal_id, "relationship_type": rel.relationship_type, "created_at": rel.created_at, "updated_at": rel.updated_at, "deleted_at": rel.deleted_at}


def list_relationships(session: Session, goal_id: str | None = None) -> list[dict]:
    stmt = active(select(GoalRelationship).order_by(GoalRelationship.created_at), GoalRelationship)
    if goal_id:
        stmt = stmt.where(or_(GoalRelationship.source_goal_id == goal_id, GoalRelationship.target_goal_id == goal_id))
    return [_serialize_relationship(rel) for rel in session.scalars(stmt)]


def update_relationship(session: Session, relationship_id: str, payload: GoalRelationshipUpdate) -> dict:
    actor_role, actor_instance_key = _actor(payload)
    rel = get_or_404(session, GoalRelationship, relationship_id, "Goal relationship not found")
    data = payload.model_dump(exclude={"actor_role", "actor_instance_key"}, exclude_unset=True)
    if "relationship_type" in data:
        if not data["relationship_type"].strip():
            raise ValidationError("relationship_type must be non-empty")
        rel.relationship_type = data["relationship_type"]
    create_activity_event(session, goal_id=rel.source_goal_id, event_type="goal_relationship_updated", actor_role=actor_role, actor_instance_key=actor_instance_key, data={"relationship_id": rel.id})
    create_activity_event(session, goal_id=rel.target_goal_id, event_type="goal_relationship_updated", actor_role=actor_role, actor_instance_key=actor_instance_key, data={"relationship_id": rel.id})
    session.commit()
    session.refresh(rel)
    return _serialize_relationship(rel)


def delete_relationship(session: Session, relationship_id: str, payload: ActorPayload) -> dict:
    actor_role, actor_instance_key = _actor(payload)
    rel = get_or_404(session, GoalRelationship, relationship_id, "Goal relationship not found")
    soft_delete(rel)
    create_activity_event(session, goal_id=rel.source_goal_id, event_type="goal_relationship_deleted", actor_role=actor_role, actor_instance_key=actor_instance_key, data={"relationship_id": rel.id})
    create_activity_event(session, goal_id=rel.target_goal_id, event_type="goal_relationship_deleted", actor_role=actor_role, actor_instance_key=actor_instance_key, data={"relationship_id": rel.id})
    session.commit()
    session.refresh(rel)
    return _serialize_relationship(rel)


def graduate_checklist_item(session: Session, item_id: str, payload: GoalChecklistItemGraduate) -> dict:
    actor_role, actor_instance_key = _actor(payload)
    item = get_checklist_item(session, item_id)
    parent_goal = get_goal(session, item.goal_id)
    new_goal = Goal(id=new_id(), title=item.title, description_md=item.description_md, is_done=item.is_done, completed_at=item.completed_at)
    session.add(new_goal)
    session.flush()
    create_activity_event(session, goal_id=new_goal.id, event_type="goal_created_from_checklist_item", actor_role=actor_role, actor_instance_key=actor_instance_key, checklist_item_id=item.id, summary=f"Graduated checklist item into goal: {new_goal.title}", data={"source_goal_id": parent_goal.id, "source_checklist_item_id": item.id})
    soft_delete(item)
    create_activity_event(session, goal_id=parent_goal.id, event_type="checklist_item_graduated", actor_role=actor_role, actor_instance_key=actor_instance_key, checklist_item_id=item.id, summary=f"Graduated checklist item: {item.title}", data={"new_goal_id": new_goal.id, "target": payload.target})
    if payload.target == "sub_goal":
        rel = GoalRelationship(id=new_id(), source_goal_id=new_goal.id, target_goal_id=parent_goal.id, relationship_type=payload.relationship_type or CANONICAL_RELATIONSHIP_TYPE)
        session.add(rel)
        create_activity_event(session, goal_id=parent_goal.id, event_type="goal_relationship_created", actor_role=actor_role, actor_instance_key=actor_instance_key, data={"relationship_id": rel.id, "source_goal_id": new_goal.id, "relationship_type": rel.relationship_type})
        create_activity_event(session, goal_id=new_goal.id, event_type="goal_relationship_created", actor_role=actor_role, actor_instance_key=actor_instance_key, data={"relationship_id": rel.id, "target_goal_id": parent_goal.id, "relationship_type": rel.relationship_type})
    session.commit()
    return get_goal_read(session, new_goal.id)


def list_activity(
    session: Session,
    *,
    goal_id: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    event_type: str | None = None,
    limit: int = 100,
) -> list[dict]:
    stmt = select(GoalActivityEvent).order_by(GoalActivityEvent.occurred_at.desc())
    if goal_id:
        stmt = stmt.where(GoalActivityEvent.goal_id == goal_id)
    if since:
        stmt = stmt.where(GoalActivityEvent.occurred_at >= since)
    if until:
        stmt = stmt.where(GoalActivityEvent.occurred_at <= until)
    if event_type:
        stmt = stmt.where(GoalActivityEvent.event_type == event_type)
    stmt = stmt.limit(max(1, min(limit, 500)))
    return [_event_read(event) for event in session.scalars(stmt)]


def list_updated(session: Session, *, since: datetime | None = None, until: datetime | None = None) -> list[dict]:
    events = list_activity(session, since=since, until=until, limit=500)
    seen: set[str] = set()
    results: list[dict] = []
    for event in events:
        if event["goal_id"] in seen:
            continue
        seen.add(event["goal_id"])
        results.append(get_goal_read(session, event["goal_id"]))
    return results


def list_finished(session: Session, *, since: datetime | None = None, until: datetime | None = None) -> list[dict]:
    stmt = select(GoalActivityEvent).where(GoalActivityEvent.event_type.in_(["goal_completed", "checklist_item_completed"])).order_by(GoalActivityEvent.occurred_at.desc())
    if since:
        stmt = stmt.where(GoalActivityEvent.occurred_at >= since)
    if until:
        stmt = stmt.where(GoalActivityEvent.occurred_at <= until)
    events = list(session.scalars(stmt.limit(500)))
    seen: set[str] = set()
    results: list[dict] = []
    for event in events:
        if event.goal_id in seen:
            continue
        seen.add(event.goal_id)
        results.append(get_goal_read(session, event.goal_id))
    return results


def search_goals(session: Session, *, q: str, include_done: bool = True, include_deleted: bool = False, limit: int = 50) -> list[dict]:
    needle = q.strip().lower()
    if not needle:
        raise ValidationError("q is required")
    rows = list_goals_full(session, include_done=include_done, include_deleted=include_deleted, order_by="updated", order_dir="desc")
    item_ids = [item["id"] for row in rows for item in row.get("checklist_items", [])]
    comments_by_item: dict[str, list[Comment]] = {item_id: [] for item_id in item_ids}
    if item_ids:
        comment_stmt = active(select(Comment).where(Comment.goal_checklist_item_id.in_(item_ids)), Comment)
        for comment in session.scalars(comment_stmt):
            comments_by_item.setdefault(comment.goal_checklist_item_id, []).append(comment)
    events_by_goal: dict[str, list[GoalActivityEvent]] = {row["id"]: [] for row in rows}
    goal_ids = [row["id"] for row in rows]
    if goal_ids:
        for event in session.scalars(select(GoalActivityEvent).where(GoalActivityEvent.goal_id.in_(goal_ids))):
            events_by_goal.setdefault(event.goal_id, []).append(event)

    results = []
    for row in rows:
        matches = []
        for field in ["title", "description_md"]:
            value = row.get(field) or ""
            if needle in value.lower():
                matches.append({"match_type": "goal", "field": field, "checklist_item_id": None, "snippet": value[:240]})
        for item in row.get("checklist_items", []):
            for field in ["title", "description_md"]:
                value = item.get(field) or ""
                if needle in value.lower():
                    matches.append({"match_type": "checklist_item", "field": field, "checklist_item_id": item["id"], "snippet": value[:240]})
            for comment in comments_by_item.get(item["id"], []):
                if needle in comment.body_md.lower():
                    matches.append({"match_type": "checklist_item_comment", "field": "body_md", "checklist_item_id": item["id"], "snippet": comment.body_md[:240]})
        for event in events_by_goal.get(row["id"], []):
            searchable = " ".join([event.event_type, event.summary or "", event.data_json or ""])
            if needle in searchable.lower():
                matches.append({"match_type": "activity_event", "field": "event", "checklist_item_id": event.checklist_item_id, "snippet": searchable[:240]})
        if matches:
            results.append({"goal": row, "matches": matches})
        if len(results) >= limit:
            break
    return results


def log_checklist_item_comment_created(session: Session, comment: Comment) -> None:
    if not comment.goal_checklist_item_id:
        return
    item = get_checklist_item(session, comment.goal_checklist_item_id)
    create_activity_event(
        session,
        goal_id=item.goal_id,
        checklist_item_id=item.id,
        event_type="checklist_item_comment_created",
        actor_role=comment.author_role,
        actor_instance_key=comment.author_instance_key,
        summary=f"Comment added to checklist item: {item.title}",
        data={"comment_id": comment.id},
    )
