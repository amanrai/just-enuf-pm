from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.schemas.tag import TagCreate, TagRead
from app.schemas.task import TaskRead
from app.services import tags as tag_service

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("", response_model=list[TagRead])
def list_tags(session: Session = Depends(get_session)):
    return tag_service.list_tags(session)


@router.post("", response_model=TagRead, status_code=status.HTTP_201_CREATED)
def create_tag(payload: TagCreate, session: Session = Depends(get_session)):
    return tag_service.create_tag(session, payload)


@router.post("/tasks/{task_id}", response_model=TaskRead)
def add_tag_to_task(task_id: str, payload: TagCreate, session: Session = Depends(get_session)):
    return tag_service.add_tag_to_task(session, task_id, payload.name)


@router.delete("/tasks/{task_id}/{tag_name}", response_model=TaskRead)
def remove_tag_from_task(task_id: str, tag_name: str, session: Session = Depends(get_session)):
    return tag_service.remove_tag_from_task(session, task_id, tag_name)
