from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.dependency import TaskDependency
from app.schemas.dependency import DependencyCreate
from app.services.base import active, soft_delete
from app.services.errors import NotFoundError, ValidationError
from app.services.task_types import get_task_type, validate_dependency_allowed
from app.services.tasks import get_task
from app.services.utils import new_id


def _has_path(session: Session, source_task_id: str, target_task_id: str) -> bool:
    frontier = [source_task_id]
    seen = set()
    while frontier:
        next_frontier: list[str] = []
        edges = list(
            session.scalars(
                active(
                    select(TaskDependency).where(TaskDependency.blocked_task_id.in_(frontier)),
                    TaskDependency,
                )
            )
        )
        for edge in edges:
            candidate = edge.blocking_task_id
            if candidate == target_task_id:
                return True
            if candidate not in seen:
                seen.add(candidate)
                next_frontier.append(candidate)
        frontier = next_frontier
    return False


def add_blocker(session: Session, blocked_task_id: str, payload: DependencyCreate) -> TaskDependency:
    blocked_task = get_task(session, blocked_task_id)
    blocking_task = get_task(session, payload.blocking_task_id)
    if blocked_task.id == blocking_task.id:
        raise ValidationError("Task cannot block itself")

    validate_dependency_allowed(get_task_type(session, blocked_task.task_type_id))
    validate_dependency_allowed(get_task_type(session, blocking_task.task_type_id))

    if _has_path(session, payload.blocking_task_id, blocked_task_id):
        raise ValidationError("Dependency would create a cycle")

    dependency = TaskDependency(
        id=new_id(),
        blocked_task_id=blocked_task_id,
        blocking_task_id=payload.blocking_task_id,
        created_by_role=payload.created_by_role,
        created_by_instance_key=payload.created_by_instance_key,
    )
    session.add(dependency)
    session.commit()
    session.refresh(dependency)
    return dependency


def list_blockers(session: Session, task_id: str, depth: int) -> list[dict]:
    get_task(session, task_id)
    remaining = None if depth == -1 else depth
    frontier = [(task_id, 0)]
    seen = set()
    results: list[dict] = []

    while frontier:
        current_ids = [item[0] for item in frontier]
        current_depth = frontier[0][1]
        if remaining is not None and current_depth > remaining:
            break
        edges = list(
            session.scalars(active(select(TaskDependency).where(TaskDependency.blocked_task_id.in_(current_ids)), TaskDependency))
        )
        next_frontier: list[tuple[str, int]] = []
        for edge in edges:
            if edge.blocking_task_id in seen:
                continue
            blocker = get_task(session, edge.blocking_task_id)
            seen.add(edge.blocking_task_id)
            results.append({"depth": current_depth, "task": blocker})
            next_frontier.append((edge.blocking_task_id, current_depth + 1))
        frontier = next_frontier

    return results


def remove_blocker(session: Session, blocked_task_id: str, blocking_task_id: str) -> TaskDependency:
    dependency = session.scalar(
        active(
            select(TaskDependency).where(
                TaskDependency.blocked_task_id == blocked_task_id,
                TaskDependency.blocking_task_id == blocking_task_id,
            ),
            TaskDependency,
        )
    )
    if dependency is None:
        raise NotFoundError("Dependency not found")
    soft_delete(dependency)
    session.commit()
    session.refresh(dependency)
    return dependency
