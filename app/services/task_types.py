from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.task_type import TaskType, TaskTypeTemplate
from app.schemas.task_type import TaskTypeCreate, TaskTypeUpdate
from app.services.base import active, get_or_404, soft_delete
from app.services.errors import ValidationError
from app.services.task_type_templates import build_default_templates
from app.services.utils import dumps_json, loads_json, new_id


def list_task_types(session: Session, project_id: str) -> list[TaskType]:
    ensure_default_task_type_templates(session)
    ensure_project_default_task_types(session, project_id)
    return list(
        session.scalars(
            active(select(TaskType).where(TaskType.project_id == project_id).order_by(TaskType.created_at), TaskType)
        )
    )


def get_task_type(session: Session, task_type_id: str) -> TaskType:
    return get_or_404(session, TaskType, task_type_id, "Task type not found")


def create_task_type(session: Session, payload: TaskTypeCreate) -> TaskType:
    from app.services.projects import get_project

    get_project(session, payload.project_id)
    task_type = TaskType(
        id=new_id(),
        project_id=payload.project_id,
        key=payload.key,
        name=payload.name,
        color=payload.color,
        icon=payload.icon,
        behavior_json=dumps_json(payload.behavior),
        is_default=int(payload.is_default),
    )
    session.add(task_type)
    session.commit()
    session.refresh(task_type)
    return task_type


def update_task_type(session: Session, task_type_id: str, payload: TaskTypeUpdate) -> TaskType:
    task_type = get_task_type(session, task_type_id)
    data = payload.model_dump(exclude_unset=True)
    if "behavior" in data:
        data["behavior_json"] = dumps_json(data.pop("behavior"))
    if "is_default" in data:
        data["is_default"] = int(data["is_default"])
    for field, value in data.items():
        setattr(task_type, field, value)
    session.commit()
    session.refresh(task_type)
    return task_type


def delete_task_type(session: Session, task_type_id: str) -> TaskType:
    task_type = get_task_type(session, task_type_id)
    soft_delete(task_type)
    session.commit()
    session.refresh(task_type)
    return task_type


def clone_templates_for_project(session: Session, project_id: str) -> list[TaskType]:
    ensure_default_task_type_templates(session)
    templates = list(session.scalars(active(select(TaskTypeTemplate).order_by(TaskTypeTemplate.created_at), TaskTypeTemplate)))
    existing_keys = {
        row[0]
        for row in session.execute(
            select(TaskType.key).where(TaskType.project_id == project_id, TaskType.is_deleted == 0)
        ).all()
    }
    created: list[TaskType] = []
    for template in templates:
        if template.key in existing_keys:
            continue
        created.append(
            TaskType(
                id=new_id(),
                project_id=project_id,
                key=template.key,
                name=template.name,
                color=template.color,
                icon=template.icon,
                behavior_json=template.behavior_json,
                is_default=1,
            )
        )
    session.add_all(created)
    return created


def ensure_default_task_type_templates(session: Session) -> None:
    existing_keys = {
        row[0]
        for row in session.execute(select(TaskTypeTemplate.key).where(TaskTypeTemplate.is_deleted == 0)).all()
    }
    missing = [template for template in build_default_templates() if template.key not in existing_keys]
    if missing:
        session.add_all(missing)
        session.flush()


def ensure_project_default_task_types(session: Session, project_id: str) -> None:
    created = clone_templates_for_project(session, project_id)
    if created:
        session.commit()


def validate_dependency_allowed(task_type: TaskType) -> None:
    behavior = loads_json(task_type.behavior_json)
    if not behavior.get("allow_dependencies", True):
        raise ValidationError(f"Task type '{task_type.name}' does not allow dependencies")
