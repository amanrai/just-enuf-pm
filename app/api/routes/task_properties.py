from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.schemas.common import SoftDeleteResponse
from app.schemas.task_property import TaskPropertyCreate, TaskPropertyRead, TaskPropertyUpdate
from app.services import task_properties as property_service

router = APIRouter(prefix="/api/task-properties", tags=["task-properties"])


@router.get("", response_model=list[TaskPropertyRead])
def list_task_properties(task_id: str = Query(...), session: Session = Depends(get_session)):
    return property_service.list_task_properties(session, task_id)


@router.post("", response_model=TaskPropertyRead, status_code=status.HTTP_201_CREATED)
def create_task_property(payload: TaskPropertyCreate, session: Session = Depends(get_session)):
    return property_service.create_task_property(session, payload)


@router.patch("/{property_id}", response_model=TaskPropertyRead)
def update_task_property(property_id: str, payload: TaskPropertyUpdate, session: Session = Depends(get_session)):
    return property_service.update_task_property(session, property_id, payload)


@router.delete("/{property_id}", response_model=SoftDeleteResponse)
def delete_task_property(property_id: str, session: Session = Depends(get_session)):
    return property_service.delete_task_property(session, property_id)
