from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.schemas.comment import CommentCreate, CommentRead, CommentUpdate
from app.schemas.common import SoftDeleteResponse
from app.services import comments as comment_service

router = APIRouter(prefix="/api/comments", tags=["comments"])


@router.post("", response_model=CommentRead, status_code=status.HTTP_201_CREATED)
def create_comment(payload: CommentCreate, session: Session = Depends(get_session)):
    return comment_service.create_comment(session, payload)


@router.patch("/{comment_id}", response_model=CommentRead)
def update_comment(comment_id: str, payload: CommentUpdate, session: Session = Depends(get_session)):
    return comment_service.update_comment(session, comment_id, payload)


@router.delete("/{comment_id}", response_model=SoftDeleteResponse)
def delete_comment(comment_id: str, session: Session = Depends(get_session)):
    return comment_service.delete_comment(session, comment_id)
