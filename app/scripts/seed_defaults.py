from sqlalchemy import select

from app.db import SessionLocal
from app.models.task_type import TaskTypeTemplate
from app.services.task_type_templates import build_default_templates


def main() -> None:
    with SessionLocal() as session:
        existing = {
            row[0]
            for row in session.execute(select(TaskTypeTemplate.key)).all()
        }
        missing = [template for template in build_default_templates() if template.key not in existing]
        if missing:
            session.add_all(missing)
        session.commit()


if __name__ == "__main__":
    main()
