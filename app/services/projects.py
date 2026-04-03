from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import Project
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.services.base import active, get_or_404, soft_delete
from app.services.errors import ValidationError
from app.services.task_types import clone_templates_for_project
from app.services.utils import new_id


def list_projects(session: Session) -> list[Project]:
    return list(session.scalars(active(select(Project).order_by(Project.created_at), Project)))


def get_project(session: Session, project_id: str) -> Project:
    return get_or_404(session, Project, project_id, "Project not found")


def create_project(session: Session, payload: ProjectCreate) -> Project:
    if payload.parent_project_id:
        get_project(session, payload.parent_project_id)

    project = Project(id=new_id(), **payload.model_dump())
    session.add(project)
    session.flush()
    clone_templates_for_project(session, project.id)
    from app.services.project_properties import ensure_project_default_properties

    ensure_project_default_properties(session, project.id)
    session.commit()
    session.refresh(project)
    return project


def update_project(session: Session, project_id: str, payload: ProjectUpdate) -> Project:
    project = get_project(session, project_id)
    if payload.parent_project_id == project_id:
        raise ValidationError("Project cannot be its own parent")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "parent_project_id" and value:
            get_project(session, value)
        setattr(project, field, value)
    session.commit()
    session.refresh(project)
    return project


def delete_project(session: Session, project_id: str) -> Project:
    project = get_project(session, project_id)
    soft_delete(project)
    session.commit()
    session.refresh(project)
    return project


def list_project_children(session: Session, project_id: str, depth: int) -> list[Project]:
    get_project(session, project_id)
    remaining = None if depth == -1 else depth
    frontier = [project_id]
    seen = set()
    results: list[Project] = []

    while frontier and (remaining is None or remaining >= 0):
        next_ids: list[str] = []
        children = list(
            session.scalars(
                active(select(Project).where(Project.parent_project_id.in_(frontier)).order_by(Project.created_at), Project)
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


def create_subproject(session: Session, parent_project_id: str, payload: ProjectCreate) -> Project:
    get_project(session, parent_project_id)
    subproject_payload = payload.model_copy(update={"parent_project_id": parent_project_id})
    return create_project(session, subproject_payload)
