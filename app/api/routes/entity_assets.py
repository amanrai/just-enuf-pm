from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.db import get_session
from app.schemas.attachment import AttachmentRead
from app.schemas.common import SoftDeleteResponse
from app.schemas.note import NoteCreate, NoteDetail, NoteRead, NoteUpdate
from app.services import entity_assets as service

router = APIRouter(prefix="/api", tags=["entity-assets"])


@router.get("/notes", response_model=list[NoteRead])
def list_notes(
    entity_type: str = Query(...),
    entity_id: str = Query(...),
    session: Session = Depends(get_session),
):
    return service.list_notes(session, entity_type, entity_id)


@router.post("/notes", response_model=NoteRead)
def create_note(payload: NoteCreate, session: Session = Depends(get_session)):
    return service.create_note(session, payload)


@router.get("/notes/{note_id}", response_model=NoteDetail)
def get_note(note_id: str, session: Session = Depends(get_session)):
    note = service.get_note(session, note_id)
    return NoteDetail(
        id=note.id,
        entity_type=note.entity_type,
        entity_id=note.entity_id,
        title=note.title,
        storage_path=note.storage_path,
        created_by_role=note.created_by_role,
        created_by_instance_key=note.created_by_instance_key,
        created_at=note.created_at,
        updated_at=note.updated_at,
        content_md=service.read_note_content(note),
    )


@router.patch("/notes/{note_id}", response_model=NoteRead)
def update_note(note_id: str, payload: NoteUpdate, session: Session = Depends(get_session)):
    return service.update_note(session, note_id, payload)


@router.delete("/notes/{note_id}", response_model=SoftDeleteResponse)
def delete_note(note_id: str, session: Session = Depends(get_session)):
    return service.delete_note(session, note_id)


@router.get("/attachments", response_model=list[AttachmentRead])
def list_attachments(
    entity_type: str = Query(...),
    entity_id: str = Query(...),
    session: Session = Depends(get_session),
):
    return service.list_attachments(session, entity_type, entity_id)


@router.post("/attachments", response_model=AttachmentRead)
async def create_attachment(
    entity_type: str = Form(...),
    entity_id: str = Form(...),
    created_by_role: str = Form(...),
    created_by_instance_key: str = Form(...),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    return await service.create_attachment(session, entity_type, entity_id, created_by_role, created_by_instance_key, file)


@router.get("/attachments/{attachment_id}", response_model=AttachmentRead)
def get_attachment(attachment_id: str, session: Session = Depends(get_session)):
    return service.get_attachment(session, attachment_id)


@router.get("/attachments/{attachment_id}/content")
def read_attachment(attachment_id: str, download: bool = Query(default=False), session: Session = Depends(get_session)):
    attachment = service.get_attachment(session, attachment_id)
    path = service.attachment_path(attachment)
    disposition = "attachment" if download else "inline"
    return FileResponse(
        path=path,
        media_type=attachment.content_type or "application/octet-stream",
        filename=attachment.file_name,
        content_disposition_type=disposition,
    )


@router.delete("/attachments/{attachment_id}", response_model=SoftDeleteResponse)
def delete_attachment(attachment_id: str, session: Session = Depends(get_session)):
    return service.delete_attachment(session, attachment_id)
