from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.schemas.comment import CommentRead
from app.schemas.common import SoftDeleteResponse
from app.schemas.project_property import ProjectPropertyRead
from app.schemas.project import ProjectAttach, ProjectCreate, ProjectRead, ProjectUpdate
from app.schemas.project_repo_link import ProjectRepoLinkRead, ProjectRepoLinkUpsert
from app.schemas.task import TaskCreate, TaskRead, TaskReorderRequest
from app.services import comments as comment_service
from app.services import project_properties as property_service
from app.services import project_repo_links as repo_link_service
from app.services import projects as project_service
from app.services import tasks as task_service

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectRead])
def list_projects(session: Session = Depends(get_session)):
    return project_service.list_projects(session)


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, session: Session = Depends(get_session)):
    return project_service.create_project(session, payload)


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(project_id: str, session: Session = Depends(get_session)):
    return project_service.get_project(session, project_id)


@router.patch("/{project_id}", response_model=ProjectRead)
def update_project(project_id: str, payload: ProjectUpdate, session: Session = Depends(get_session)):
    return project_service.update_project(session, project_id, payload)


@router.delete("/{project_id}", response_model=SoftDeleteResponse)
def delete_project(project_id: str, session: Session = Depends(get_session)):
    return project_service.delete_project(session, project_id)


@router.get("/{project_id}/children", response_model=list[ProjectRead])
def list_project_children(project_id: str, depth: int = Query(default=0), session: Session = Depends(get_session)):
    return project_service.list_project_children(session, project_id, depth)


@router.get("/{project_id}/subprojects", response_model=list[ProjectRead])
def list_subprojects(project_id: str, depth: int = Query(default=0), session: Session = Depends(get_session)):
    return project_service.list_project_children(session, project_id, depth)


@router.post("/{project_id}/subprojects", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_subproject(project_id: str, payload: ProjectCreate, session: Session = Depends(get_session)):
    return project_service.create_subproject(session, project_id, payload)


@router.post("/{project_id}/parent", response_model=ProjectRead)
def attach_project_to_parent(project_id: str, payload: ProjectAttach, session: Session = Depends(get_session)):
    return project_service.update_project(
        session,
        project_id,
        ProjectUpdate(parent_project_id=payload.parent_project_id),
    )


@router.get("/{project_id}/comments", response_model=list[CommentRead])
def list_project_comments(project_id: str, session: Session = Depends(get_session)):
    return comment_service.list_comments(session, project_id=project_id)


@router.get("/{project_id}/properties", response_model=list[ProjectPropertyRead])
def list_project_properties(project_id: str, session: Session = Depends(get_session)):
    return property_service.list_project_properties(session, project_id)


@router.get("/{project_id}/repo-link", response_model=ProjectRepoLinkRead | None)
def get_project_repo_link(project_id: str, session: Session = Depends(get_session)):
    return repo_link_service.get_project_repo_link(session, project_id)


@router.put("/{project_id}/repo-link", response_model=ProjectRepoLinkRead)
def upsert_project_repo_link(project_id: str, payload: ProjectRepoLinkUpsert, session: Session = Depends(get_session)):
    return repo_link_service.upsert_project_repo_link(session, project_id, payload.remote_url)


@router.get("/{project_id}/tasks", response_model=list[TaskRead])
def list_project_tasks(project_id: str, session: Session = Depends(get_session)):
    return task_service.list_tasks(session, project_id=project_id)


@router.post("/{project_id}/tasks", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_project_task(project_id: str, payload: TaskCreate, session: Session = Depends(get_session)):
    project_service.get_project(session, project_id)
    task_payload = payload.model_copy(update={"project_id": project_id})
    return task_service.create_task(session, task_payload)


@router.post("/{project_id}/tasks/reorder", response_model=list[TaskRead])
def reorder_project_tasks(project_id: str, payload: TaskReorderRequest, session: Session = Depends(get_session)):
    project_service.get_project(session, project_id)
    return task_service.reorder_project_tasks(session, project_id, payload.task_ids)
