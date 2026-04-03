from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.schemas.common import SoftDeleteResponse
from app.schemas.task_type import TaskTypeCreate, TaskTypeRead, TaskTypeUpdate
from app.services import task_types as task_type_service

router = APIRouter(prefix="/api/task-types", tags=["task-types"])


@router.get("", response_model=list[TaskTypeRead])
def list_task_types(project_id: str = Query(...), session: Session = Depends(get_session)):
    return task_type_service.list_task_types(session, project_id)


@router.post("", response_model=TaskTypeRead, status_code=status.HTTP_201_CREATED)
def create_task_type(payload: TaskTypeCreate, session: Session = Depends(get_session)):
    return task_type_service.create_task_type(session, payload)


@router.patch("/{task_type_id}", response_model=TaskTypeRead)
def update_task_type(task_type_id: str, payload: TaskTypeUpdate, session: Session = Depends(get_session)):
    return task_type_service.update_task_type(session, task_type_id, payload)


@router.delete("/{task_type_id}", response_model=SoftDeleteResponse)
def delete_task_type(task_type_id: str, session: Session = Depends(get_session)):
    return task_type_service.delete_task_type(session, task_type_id)
