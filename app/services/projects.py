from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import Project
from app.models.project_repo_link import ProjectRepoLink
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.services.base import active, get_or_404, soft_delete
from app.services.errors import ValidationError
from app.services.task_types import clone_templates_for_project
from app.services.utils import new_id


def _relative_repo_path_by_project_id(session: Session, project_ids: list[str]) -> dict[str, str]:
    if not project_ids:
        return {}
    links = session.scalars(select(ProjectRepoLink).where(ProjectRepoLink.project_id.in_(project_ids)))
    return {link.project_id: f"repos/{link.repo_subpath}" for link in links}


def _serialize_project(project: Project, relative_repo_path: str | None = None) -> dict:
    return {
        "id": project.id,
        "parent_project_id": project.parent_project_id,
        "name": project.name,
        "slug": project.slug,
        "description_md": project.description_md,
        "relative_repo_path": relative_repo_path,
        "created_by_role": project.created_by_role,
        "created_by_instance_key": project.created_by_instance_key,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
    }


def list_projects(session: Session) -> list[dict]:
    projects = list(session.scalars(active(select(Project).order_by(Project.created_at), Project)))
    repo_paths = _relative_repo_path_by_project_id(session, [project.id for project in projects])
    return [_serialize_project(project, repo_paths.get(project.id)) for project in projects]


def get_project(session: Session, project_id: str) -> Project:
    return get_or_404(session, Project, project_id, "Project not found")


def get_project_read(session: Session, project_id: str) -> dict:
    project = get_project(session, project_id)
    repo_paths = _relative_repo_path_by_project_id(session, [project.id])
    return _serialize_project(project, repo_paths.get(project.id))


def create_project(session: Session, payload: ProjectCreate) -> dict:
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
    return _serialize_project(project)


def update_project(session: Session, project_id: str, payload: ProjectUpdate) -> dict:
    project = get_project(session, project_id)
    if payload.parent_project_id == project_id:
        raise ValidationError("Project cannot be its own parent")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "parent_project_id" and value:
            get_project(session, value)
        setattr(project, field, value)
    session.commit()
    session.refresh(project)
    repo_paths = _relative_repo_path_by_project_id(session, [project.id])
    return _serialize_project(project, repo_paths.get(project.id))


def delete_project(session: Session, project_id: str) -> dict:
    project = get_project(session, project_id)
    soft_delete(project)
    session.commit()
    session.refresh(project)
    repo_paths = _relative_repo_path_by_project_id(session, [project.id])
    return _serialize_project(project, repo_paths.get(project.id))


def list_project_children(session: Session, project_id: str, depth: int) -> list[dict]:
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

    repo_paths = _relative_repo_path_by_project_id(session, [project.id for project in results])
    return [_serialize_project(project, repo_paths.get(project.id)) for project in results]


def create_subproject(session: Session, parent_project_id: str, payload: ProjectCreate) -> dict:
    get_project(session, parent_project_id)
    subproject_payload = payload.model_copy(update={"parent_project_id": parent_project_id})
    return create_project(session, subproject_payload)
