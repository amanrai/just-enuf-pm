from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_session
from app.schemas.skill_default import SkillDefaultRead, SkillDefaultUpdate
from app.services import skill_defaults as service

router = APIRouter(prefix="/api/skill-defaults", tags=["skill-defaults"])


@router.get("", response_model=list[SkillDefaultRead])
def list_skill_defaults(session: Session = Depends(get_session)):
    return service.list_skill_defaults(session)


@router.put("/{skill_name}", response_model=SkillDefaultRead)
def upsert_skill_default(skill_name: str, payload: SkillDefaultUpdate, session: Session = Depends(get_session)):
    return service.upsert_skill_default(session, skill_name, payload)
