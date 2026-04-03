from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def ensure_data_dir() -> None:
    settings.sqlite_path.parent.mkdir(parents=True, exist_ok=True)


def _ensure_runtime_migrations() -> None:
    with engine.begin() as connection:
        task_columns = {row[1] for row in connection.execute(text("PRAGMA table_info(tasks)")).fetchall()}
        if "display_order" not in task_columns:
            connection.execute(text("ALTER TABLE tasks ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0"))
            task_rows = connection.execute(
                text("SELECT id, project_id, parent_task_id FROM tasks ORDER BY created_at, id")
            ).fetchall()
            project_counters: dict[str, int] = {}
            parent_counters: dict[str, int] = {}
            for task_id, project_id, parent_task_id in task_rows:
                if project_id is not None:
                    next_order = project_counters.get(project_id, 0)
                    project_counters[project_id] = next_order + 1
                elif parent_task_id is not None:
                    next_order = parent_counters.get(parent_task_id, 0)
                    parent_counters[parent_task_id] = next_order + 1
                else:
                    next_order = 0
                connection.execute(
                    text("UPDATE tasks SET display_order = :display_order WHERE id = :task_id"),
                    {"display_order": next_order, "task_id": task_id},
                )


def create_schema() -> None:
    ensure_data_dir()
    from app.models import attachment, comment, dependency, note, project, project_property, project_repo_link, tag, task, task_property, task_type  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_runtime_migrations()


def drop_schema() -> None:
    from app.models import attachment, comment, dependency, note, project, project_property, project_repo_link, tag, task, task_property, task_type  # noqa: F401

    Base.metadata.drop_all(bind=engine)


def delete_database_file() -> None:
    db_path = Path(settings.sqlite_path)
    if db_path.exists():
        db_path.unlink()


def get_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
