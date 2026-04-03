from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.skill_default import SkillDefault
from app.schemas.skill_default import SkillDefaultUpdate


def list_skill_defaults(session: Session) -> list[SkillDefault]:
    return list(session.scalars(select(SkillDefault).order_by(SkillDefault.skill_name)))


def get_skill_default(session: Session, skill_name: str) -> SkillDefault | None:
    return session.scalar(select(SkillDefault).where(SkillDefault.skill_name == skill_name))


def upsert_skill_default(session: Session, skill_name: str, payload: SkillDefaultUpdate) -> SkillDefault:
    row = get_skill_default(session, skill_name)
    if row is None:
        row = SkillDefault(skill_name=skill_name)
        session.add(row)
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(row, field, value)
    session.commit()
    session.refresh(row)
    return row
