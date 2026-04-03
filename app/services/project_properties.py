from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project_property import ProjectProperty
from app.schemas.project_property import ProjectPropertyCreate, ProjectPropertyUpdate
from app.services.base import active, get_or_404, soft_delete
from app.services.projects import get_project
from app.services.utils import new_id


DEFAULT_PROJECT_PROPERTIES = [
    {"key": "remote_repo", "value": "", "value_type": "text"},
]


def ensure_project_default_properties(session: Session, project_id: str) -> list[ProjectProperty]:
    get_project(session, project_id)
    existing_keys = {
        row[0]
        for row in session.execute(
            select(ProjectProperty.key).where(ProjectProperty.project_id == project_id, ProjectProperty.is_deleted == 0)
        ).all()
    }
    created: list[ProjectProperty] = []
    for item in DEFAULT_PROJECT_PROPERTIES:
        if item["key"] in existing_keys:
            continue
        created.append(
            ProjectProperty(
                id=new_id(),
                project_id=project_id,
                key=item["key"],
                value=item["value"],
                value_type=item["value_type"],
            )
        )
    if created:
        session.add_all(created)
        session.flush()
    return created


def upsert_remote_repo_property(session: Session, project_id: str, remote_url: str) -> ProjectProperty:
    get_project(session, project_id)
    prop = session.scalar(
        active(
            select(ProjectProperty).where(ProjectProperty.project_id == project_id, ProjectProperty.key == "remote_repo"),
            ProjectProperty,
        )
    )
    if prop is None:
        prop = ProjectProperty(
            id=new_id(),
            project_id=project_id,
            key="remote_repo",
            value=remote_url,
            value_type="text",
        )
        session.add(prop)
    else:
        prop.value = remote_url
        prop.value_type = "text"
    session.flush()
    return prop


def list_project_properties(session: Session, project_id: str) -> list[ProjectProperty]:
    created = ensure_project_default_properties(session, project_id)
    if created:
        session.commit()
    return list(
        session.scalars(
            active(
                select(ProjectProperty)
                .where(ProjectProperty.project_id == project_id)
                .order_by(ProjectProperty.created_at),
                ProjectProperty,
            )
        )
    )


def get_project_property(session: Session, property_id: str) -> ProjectProperty:
    return get_or_404(session, ProjectProperty, property_id, "Project property not found")


def create_project_property(session: Session, payload: ProjectPropertyCreate) -> ProjectProperty:
    get_project(session, payload.project_id)
    prop = ProjectProperty(id=new_id(), **payload.model_dump())
    session.add(prop)
    session.commit()
    session.refresh(prop)
    return prop


def update_project_property(session: Session, property_id: str, payload: ProjectPropertyUpdate) -> ProjectProperty:
    prop = get_project_property(session, property_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(prop, field, value)
    session.commit()
    session.refresh(prop)
    return prop


def delete_project_property(session: Session, property_id: str) -> ProjectProperty:
    prop = get_project_property(session, property_id)
    soft_delete(prop)
    session.commit()
    session.refresh(prop)
    return prop
