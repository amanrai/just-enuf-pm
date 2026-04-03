from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.comment import Comment
from app.schemas.comment import CommentCreate, CommentUpdate
from app.services.base import active, get_or_404, soft_delete
from app.services.errors import ValidationError
from app.services.projects import get_project
from app.services.tasks import get_task
from app.services.utils import new_id


def list_comments(session: Session, *, project_id: str | None = None, task_id: str | None = None) -> list[Comment]:
    stmt = select(Comment).order_by(Comment.created_at)
    if project_id:
        stmt = stmt.where(Comment.project_id == project_id)
    if task_id:
        stmt = stmt.where(Comment.task_id == task_id)
    return list(session.scalars(active(stmt, Comment)))


def get_comment(session: Session, comment_id: str) -> Comment:
    return get_or_404(session, Comment, comment_id, "Comment not found")


def create_comment(session: Session, payload: CommentCreate) -> Comment:
    if bool(payload.project_id) == bool(payload.task_id):
        raise ValidationError("Comment must belong to exactly one of project_id or task_id")

    if payload.project_id:
        get_project(session, payload.project_id)
    if payload.task_id:
        get_task(session, payload.task_id)
    if payload.parent_comment_id:
        parent = get_comment(session, payload.parent_comment_id)
        if parent.project_id != payload.project_id or parent.task_id != payload.task_id:
            raise ValidationError("Reply must target the same parent resource as the parent comment")

    comment = Comment(
        id=new_id(),
        author_role=payload.author_role,
        author_instance_key=payload.author_instance_key,
        body_md=payload.body_md,
        body_format=payload.body_format,
        project_id=payload.project_id,
        task_id=payload.task_id,
        parent_comment_id=payload.parent_comment_id,
        is_human_comment=int(payload.author_role == "human"),
    )
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return comment


def update_comment(session: Session, comment_id: str, payload: CommentUpdate) -> Comment:
    comment = get_comment(session, comment_id)
    comment.body_md = payload.body_md
    session.commit()
    session.refresh(comment)
    return comment


def delete_comment(session: Session, comment_id: str) -> Comment:
    comment = get_comment(session, comment_id)
    soft_delete(comment)
    session.commit()
    session.refresh(comment)
    return comment
