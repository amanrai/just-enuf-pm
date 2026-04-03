from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models.mixins import utc_now
from app.services.errors import NotFoundError


def active(stmt: Select, model) -> Select:
    return stmt.where(model.is_deleted == 0)


def get_or_404(session: Session, model, entity_id: str, message: str | None = None):
    entity = session.scalar(active(select(model).where(model.id == entity_id), model))
    if entity is None:
        raise NotFoundError(message or f"{model.__name__} not found")
    return entity


def soft_delete(entity) -> None:
    entity.is_deleted = 1
    entity.deleted_at = utc_now()
