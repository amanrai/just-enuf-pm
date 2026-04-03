from pydantic import BaseModel
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.schemas.comment import CommentRead
from app.schemas.common import SoftDeleteResponse
from app.schemas.dependency import DependencyCreate, DependencyRead
from app.schemas.task_property import TaskPropertyRead
from app.schemas.task import TaskCreate, TaskRead, TaskUpdate
from app.services import comments as comment_service
from app.services import dependencies as dependency_service
from app.services import task_properties as task_property_service
from app.services import tasks as task_service

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class BlockerNode(BaseModel):
    depth: int
    task: TaskRead


@router.get("", response_model=list[TaskRead])
def list_tasks(
    project_id: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    status: str | None = Query(default=None),
    session: Session = Depends(get_session),
):
    return task_service.list_tasks(session, project_id=project_id, tag=tag, status=status)


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, session: Session = Depends(get_session)):
    return task_service.create_task(session, payload)


@router.get("/{task_id}", response_model=TaskRead)
def get_task(task_id: str, session: Session = Depends(get_session)):
    return task_service.get_task(session, task_id)


@router.patch("/{task_id}", response_model=TaskRead)
def update_task(task_id: str, payload: TaskUpdate, session: Session = Depends(get_session)):
    return task_service.update_task(session, task_id, payload)


@router.delete("/{task_id}", response_model=SoftDeleteResponse)
def delete_task(task_id: str, session: Session = Depends(get_session)):
    return task_service.delete_task(session, task_id)


@router.get("/{task_id}/children", response_model=list[TaskRead])
def list_task_children(task_id: str, depth: int = Query(default=0), session: Session = Depends(get_session)):
    return task_service.list_task_children(session, task_id, depth)


@router.post("/{task_id}/blockers", response_model=DependencyRead, status_code=status.HTTP_201_CREATED)
def add_blocker(task_id: str, payload: DependencyCreate, session: Session = Depends(get_session)):
    return dependency_service.add_blocker(session, task_id, payload)


@router.get("/{task_id}/blockers", response_model=list[BlockerNode])
def list_blockers(task_id: str, depth: int = Query(default=0), session: Session = Depends(get_session)):
    return dependency_service.list_blockers(session, task_id, depth)


@router.delete("/{task_id}/blockers/{blocking_task_id}", response_model=SoftDeleteResponse)
def remove_blocker(task_id: str, blocking_task_id: str, session: Session = Depends(get_session)):
    return dependency_service.remove_blocker(session, task_id, blocking_task_id)


@router.get("/{task_id}/comments", response_model=list[CommentRead])
def list_task_comments(task_id: str, session: Session = Depends(get_session)):
    return comment_service.list_comments(session, task_id=task_id)


@router.get("/{task_id}/properties", response_model=list[TaskPropertyRead])
def list_task_properties(task_id: str, session: Session = Depends(get_session)):
    return task_property_service.list_task_properties(session, task_id)
