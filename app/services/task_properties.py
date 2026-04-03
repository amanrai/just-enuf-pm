from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.task_property import TaskProperty
from app.schemas.task_property import TaskPropertyCreate, TaskPropertyUpdate
from app.services.base import active, get_or_404, soft_delete
from app.services.tasks import get_task
from app.services.utils import new_id


def list_task_properties(session: Session, task_id: str) -> list[TaskProperty]:
    get_task(session, task_id)
    return list(
        session.scalars(
            active(
                select(TaskProperty)
                .where(TaskProperty.task_id == task_id)
                .order_by(TaskProperty.created_at),
                TaskProperty,
            )
        )
    )


def get_task_property(session: Session, property_id: str) -> TaskProperty:
    return get_or_404(session, TaskProperty, property_id, "Task property not found")


def create_task_property(session: Session, payload: TaskPropertyCreate) -> TaskProperty:
    get_task(session, payload.task_id)
    prop = TaskProperty(id=new_id(), **payload.model_dump())
    session.add(prop)
    session.commit()
    session.refresh(prop)
    return prop


def update_task_property(session: Session, property_id: str, payload: TaskPropertyUpdate) -> TaskProperty:
    prop = get_task_property(session, property_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(prop, field, value)
    session.commit()
    session.refresh(prop)
    return prop


def delete_task_property(session: Session, property_id: str) -> TaskProperty:
    prop = get_task_property(session, property_id)
    soft_delete(prop)
    session.commit()
    session.refresh(prop)
    return prop
