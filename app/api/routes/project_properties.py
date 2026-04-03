from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.schemas.common import SoftDeleteResponse
from app.schemas.project_property import (
    ProjectPropertyCreate,
    ProjectPropertyRead,
    ProjectPropertyUpdate,
)
from app.services import project_properties as property_service

router = APIRouter(prefix="/api/project-properties", tags=["project-properties"])


@router.get("", response_model=list[ProjectPropertyRead])
def list_project_properties(project_id: str = Query(...), session: Session = Depends(get_session)):
    return property_service.list_project_properties(session, project_id)


@router.post("", response_model=ProjectPropertyRead, status_code=status.HTTP_201_CREATED)
def create_project_property(payload: ProjectPropertyCreate, session: Session = Depends(get_session)):
    return property_service.create_project_property(session, payload)


@router.patch("/{property_id}", response_model=ProjectPropertyRead)
def update_project_property(property_id: str, payload: ProjectPropertyUpdate, session: Session = Depends(get_session)):
    return property_service.update_project_property(session, property_id, payload)


@router.delete("/{property_id}", response_model=SoftDeleteResponse)
def delete_project_property(property_id: str, session: Session = Depends(get_session)):
    return property_service.delete_project_property(session, property_id)
