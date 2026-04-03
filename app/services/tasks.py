from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.tag import Tag
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskUpdate
from app.services.base import active, get_or_404, soft_delete
from app.services.errors import NotFoundError, ValidationError
from app.services.projects import get_project
from app.services.tags import get_or_create_tag
from app.services.task_types import get_task_type
from app.services.utils import new_id


VALID_STATUSES = {
    "unopened",
    "in_planning",
    "in_execution",
    "ready_for_human_review",
    "human_reviewed_and_closed",
    "closed_without_human_review",
}


def _resolved_tags(session: Session, tag_names: list[str] | None) -> list:
    if not tag_names:
        return []
    ordered: list = []
    seen: set[str] = set()
    for raw_name in tag_names:
        normalized = raw_name.strip()
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(get_or_create_tag(session, normalized))
    return ordered


def list_tasks(
    session: Session,
    project_id: str | None = None,
    tag: str | None = None,
    status: str | None = None,
) -> list[Task]:
    stmt = select(Task).options(selectinload(Task.tags)).order_by(Task.display_order, Task.created_at)
    if project_id:
        stmt = stmt.where(Task.project_id == project_id)
    if tag:
        stmt = stmt.join(Task.tags).where(func.lower(Tag.name) == tag.strip().lower(), Tag.is_deleted == 0)
    if status:
        stmt = stmt.where(Task.status == status)
    return list(session.scalars(active(stmt, Task)))


def _next_display_order(session: Session, project_id: str | None, parent_task_id: str | None) -> int:
    stmt = select(func.max(Task.display_order))
    if project_id is not None:
        stmt = stmt.where(Task.project_id == project_id)
    elif parent_task_id is not None:
        stmt = stmt.where(Task.parent_task_id == parent_task_id, Task.project_id.is_(None))
    else:
        return 0
    max_order = session.scalar(active(stmt, Task))
    return 0 if max_order is None else int(max_order) + 1


def get_task(session: Session, task_id: str) -> Task:
    stmt = select(Task).options(selectinload(Task.tags)).where(Task.id == task_id)
    task = session.scalar(active(stmt, Task))
    if task is None:
        raise NotFoundError("Task not found")
    return task


def create_task(session: Session, payload: TaskCreate) -> Task:
    if payload.project_id is None and payload.parent_task_id is None:
        raise ValidationError("Task must have a parent project, a parent task, or both")
    if payload.project_id:
        get_project(session, payload.project_id)
    if payload.parent_task_id:
        get_task(session, payload.parent_task_id)
    get_task_type(session, payload.task_type_id)
    if payload.status not in VALID_STATUSES:
        raise ValidationError("Invalid task status")

    task = Task(
        id=new_id(),
        display_order=_next_display_order(session, payload.project_id, payload.parent_task_id),
        **payload.model_dump(exclude={"tag_names"}),
    )
    if payload.tag_names:
        task.tags = _resolved_tags(session, payload.tag_names)
    session.add(task)
    session.commit()
    session.refresh(task)
    return get_task(session, task.id)


def update_task(session: Session, task_id: str, payload: TaskUpdate) -> Task:
    task = get_task(session, task_id)
    data = payload.model_dump(exclude_unset=True)
    if "project_id" in data and data["project_id"]:
        get_project(session, data["project_id"])
    if "parent_task_id" in data and data["parent_task_id"]:
        get_task(session, data["parent_task_id"])
    if "task_type_id" in data and data["task_type_id"]:
        get_task_type(session, data["task_type_id"])
    if "status" in data and data["status"] not in VALID_STATUSES:
        raise ValidationError("Invalid task status")
    tag_names = data.pop("tag_names", None)
    for field, value in data.items():
        setattr(task, field, value)
    if tag_names is not None:
        task.tags = _resolved_tags(session, tag_names)
    if task.project_id is None and task.parent_task_id is None:
        raise ValidationError("Task must have a parent project, a parent task, or both")
    session.commit()
    return get_task(session, task.id)


def delete_task(session: Session, task_id: str) -> Task:
    task = get_task(session, task_id)
    soft_delete(task)
    session.commit()
    session.refresh(task)
    return task


def reorder_project_tasks(session: Session, project_id: str, task_ids: list[str]) -> list[Task]:
    project_tasks = list(
        session.scalars(active(select(Task).options(selectinload(Task.tags)).where(Task.project_id == project_id), Task))
    )
    task_by_id = {task.id: task for task in project_tasks}
    project_task_ids = set(task_by_id)
    requested_ids = list(task_ids)
    requested_id_set = set(requested_ids)

    if len(requested_ids) != len(requested_id_set):
        raise ValidationError("Task reorder payload contains duplicate task IDs")
    if not requested_id_set:
        raise ValidationError("Task reorder payload must contain at least one task ID")
    if not requested_id_set.issubset(project_task_ids):
        raise ValidationError("Task reorder payload contains tasks outside the selected project")

    untouched_tasks = [
        task for task in sorted(project_tasks, key=lambda task: (task.display_order, task.created_at))
        if task.id not in requested_id_set
    ]
    ordered_tasks = [task_by_id[task_id] for task_id in requested_ids] + untouched_tasks

    for index, task in enumerate(ordered_tasks):
        task.display_order = index

    session.commit()
    return list_tasks(session, project_id=project_id)


def list_task_children(session: Session, task_id: str, depth: int) -> list[Task]:
    get_task(session, task_id)
    remaining = None if depth == -1 else depth
    frontier = [task_id]
    seen = set()
    results: list[Task] = []

    while frontier and (remaining is None or remaining >= 0):
        next_ids: list[str] = []
        children = list(
            session.scalars(
                active(
                    select(Task)
                    .options(selectinload(Task.tags))
                    .where(Task.parent_task_id.in_(frontier))
                    .order_by(Task.display_order, Task.created_at),
                    Task,
                )
            )
        )
        for child in children:
            if child.id not in seen:
                seen.add(child.id)
                results.append(child)
                next_ids.append(child.id)
        frontier = next_ids
        if remaining is not None:
            remaining -= 1

    return results
