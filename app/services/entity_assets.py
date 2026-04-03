from pathlib import Path
from urllib.parse import quote

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.attachment import Attachment
from app.models.note import Note
from app.schemas.note import NoteCreate, NoteUpdate
from app.services.base import active, get_or_404, soft_delete
from app.services.errors import ValidationError
from app.services.projects import get_project
from app.services.tasks import get_task
from app.services.utils import new_id

ALLOWED_ENTITY_TYPES = {"project", "task"}


def _validate_entity(session: Session, entity_type: str, entity_id: str) -> None:
    if entity_type not in ALLOWED_ENTITY_TYPES:
        raise ValidationError("Invalid entity type")
    if entity_type == "project":
        get_project(session, entity_id)
        return
    get_task(session, entity_id)


def _safe_name(name: str) -> str:
    return "".join(char if char.isalnum() or char in {"-", "_", "."} else "-" for char in name).strip("-") or "file"


def _attachments_root() -> Path:
    root = get_settings().attachments_root
    root.mkdir(parents=True, exist_ok=True)
    return root


def _entity_dir(entity_type: str, entity_id: str, kind: str) -> Path:
    folder = "projects" if entity_type == "project" else "tasks"
    path = _attachments_root() / folder / entity_id / kind
    path.mkdir(parents=True, exist_ok=True)
    return path


def _relative_storage_path(path: Path) -> str:
    root = _attachments_root()
    return str(path.relative_to(root))


def _absolute_storage_path(storage_path: str) -> Path:
    return _attachments_root() / storage_path


def list_notes(session: Session, entity_type: str, entity_id: str) -> list[Note]:
    _validate_entity(session, entity_type, entity_id)
    stmt = (
        select(Note)
        .where(Note.entity_type == entity_type, Note.entity_id == entity_id)
        .order_by(Note.updated_at.desc(), Note.created_at.desc())
    )
    return list(session.scalars(active(stmt, Note)))


def get_note(session: Session, note_id: str) -> Note:
    return get_or_404(session, Note, note_id, "Note not found")


def read_note_content(note: Note) -> str:
    path = _absolute_storage_path(note.storage_path)
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def create_note(session: Session, payload: NoteCreate) -> Note:
    _validate_entity(session, payload.entity_type, payload.entity_id)
    note_id = new_id()
    path = _entity_dir(payload.entity_type, payload.entity_id, "notes") / f"{note_id}.md"
    path.write_text(payload.content_md, encoding="utf-8")
    note = Note(
        id=note_id,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        title=payload.title.strip() or "Untitled Note",
        storage_path=_relative_storage_path(path),
        created_by_role=payload.created_by_role,
        created_by_instance_key=payload.created_by_instance_key,
    )
    session.add(note)
    session.commit()
    session.refresh(note)
    return note


def update_note(session: Session, note_id: str, payload: NoteUpdate) -> Note:
    note = get_note(session, note_id)
    data = payload.model_dump(exclude_unset=True)
    if "title" in data and data["title"] is not None:
        note.title = data["title"].strip() or note.title
    if "content_md" in data and data["content_md"] is not None:
        path = _absolute_storage_path(note.storage_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(data["content_md"], encoding="utf-8")
    session.commit()
    session.refresh(note)
    return note


def delete_note(session: Session, note_id: str) -> Note:
    note = get_note(session, note_id)
    path = _absolute_storage_path(note.storage_path)
    if path.exists():
        path.unlink()
    soft_delete(note)
    session.commit()
    session.refresh(note)
    return note


def list_attachments(session: Session, entity_type: str, entity_id: str) -> list[Attachment]:
    _validate_entity(session, entity_type, entity_id)
    stmt = (
        select(Attachment)
        .where(Attachment.entity_type == entity_type, Attachment.entity_id == entity_id)
        .order_by(Attachment.updated_at.desc(), Attachment.created_at.desc())
    )
    return list(session.scalars(active(stmt, Attachment)))


def get_attachment(session: Session, attachment_id: str) -> Attachment:
    return get_or_404(session, Attachment, attachment_id, "Attachment not found")


async def create_attachment(
    session: Session,
    entity_type: str,
    entity_id: str,
    created_by_role: str,
    created_by_instance_key: str,
    upload: UploadFile,
) -> Attachment:
    _validate_entity(session, entity_type, entity_id)
    attachment_id = new_id()
    safe_name = _safe_name(upload.filename or attachment_id)
    path = _entity_dir(entity_type, entity_id, "files") / f"{attachment_id}-{safe_name}"
    content = await upload.read()
    path.write_bytes(content)
    attachment = Attachment(
        id=attachment_id,
        entity_type=entity_type,
        entity_id=entity_id,
        file_name=upload.filename or safe_name,
        storage_path=_relative_storage_path(path),
        content_type=upload.content_type,
        size_bytes=len(content),
        created_by_role=created_by_role,
        created_by_instance_key=created_by_instance_key,
    )
    session.add(attachment)
    session.commit()
    session.refresh(attachment)
    return attachment


def delete_attachment(session: Session, attachment_id: str) -> Attachment:
    attachment = get_attachment(session, attachment_id)
    path = _absolute_storage_path(attachment.storage_path)
    if path.exists():
        path.unlink()
    soft_delete(attachment)
    session.commit()
    session.refresh(attachment)
    return attachment


def attachment_path(attachment: Attachment) -> Path:
    return _absolute_storage_path(attachment.storage_path)


def attachment_download_name(attachment: Attachment) -> str:
    return quote(attachment.file_name)
