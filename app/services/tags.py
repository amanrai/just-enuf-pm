from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.tag import Tag
from app.models.task import Task
from app.schemas.tag import TagCreate
from app.services.base import active, get_or_404
from app.services.errors import ValidationError
from app.services.utils import new_id


def _normalize_tag_name(name: str) -> str:
    normalized = (name or "").strip()
    if not normalized:
        raise ValidationError("Tag name is required")
    return normalized


def list_tags(session: Session) -> list[Tag]:
    stmt = active(select(Tag).order_by(func.lower(Tag.name), Tag.created_at), Tag)
    return list(session.scalars(stmt))


def get_tag_by_name(session: Session, name: str) -> Tag | None:
    normalized = _normalize_tag_name(name)
    stmt = select(Tag).where(func.lower(Tag.name) == normalized.lower())
    return session.scalar(active(stmt, Tag))


def create_tag(session: Session, payload: TagCreate) -> Tag:
    normalized = _normalize_tag_name(payload.name)
    existing = get_tag_by_name(session, normalized)
    if existing is not None:
        return existing
    tag = Tag(id=new_id(), name=normalized)
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return tag


def get_or_create_tag(session: Session, name: str) -> Tag:
    existing = get_tag_by_name(session, name)
    if existing is not None:
        return existing
    return create_tag(session, TagCreate(name=name))


def add_tag_to_task(session: Session, task_id: str, name: str) -> Task:
    task = get_or_404(session, Task, task_id, "Task not found")
    tag = get_or_create_tag(session, name)
    if all(existing.id != tag.id for existing in task.tags):
        task.tags.append(tag)
        session.commit()
    session.refresh(task)
    return task


def remove_tag_from_task(session: Session, task_id: str, name: str) -> Task:
    task = get_or_404(session, Task, task_id, "Task not found")
    normalized = _normalize_tag_name(name).lower()
    task.tags = [tag for tag in task.tags if tag.name.lower() != normalized]
    session.commit()
    session.refresh(task)
    return task
