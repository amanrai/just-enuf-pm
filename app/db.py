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

        comment_columns = {row[1] for row in connection.execute(text("PRAGMA table_info(comments)")).fetchall()}
        if comment_columns and "goal_checklist_item_id" not in comment_columns:
            connection.execute(text("ALTER TABLE comments ADD COLUMN goal_checklist_item_id VARCHAR REFERENCES goal_checklist_items(id)"))

        comment_sql = connection.execute(
            text("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'comments'")
        ).scalar()
        if comment_sql and "goal_checklist_item_id IS NOT NULL" not in comment_sql:
            connection.execute(text("PRAGMA foreign_keys=OFF"))
            connection.execute(text("ALTER TABLE comments RENAME TO comments_old"))
            connection.execute(
                text(
                    """
                    CREATE TABLE comments (
                        id VARCHAR NOT NULL,
                        project_id VARCHAR,
                        task_id VARCHAR,
                        goal_checklist_item_id VARCHAR,
                        parent_comment_id VARCHAR,
                        author_role TEXT NOT NULL,
                        author_instance_key TEXT NOT NULL,
                        body_md TEXT NOT NULL,
                        body_format TEXT NOT NULL,
                        is_human_comment INTEGER NOT NULL,
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL,
                        is_deleted INTEGER NOT NULL,
                        deleted_at DATETIME,
                        PRIMARY KEY (id),
                        CONSTRAINT ck_comment_single_target CHECK (
                            (project_id IS NOT NULL AND task_id IS NULL AND goal_checklist_item_id IS NULL) OR
                            (project_id IS NULL AND task_id IS NOT NULL AND goal_checklist_item_id IS NULL) OR
                            (project_id IS NULL AND task_id IS NULL AND goal_checklist_item_id IS NOT NULL)
                        ),
                        FOREIGN KEY(project_id) REFERENCES projects (id),
                        FOREIGN KEY(task_id) REFERENCES tasks (id),
                        FOREIGN KEY(goal_checklist_item_id) REFERENCES goal_checklist_items (id),
                        FOREIGN KEY(parent_comment_id) REFERENCES comments (id)
                    )
                    """
                )
            )
            connection.execute(
                text(
                    """
                    INSERT INTO comments (
                        id, project_id, task_id, goal_checklist_item_id, parent_comment_id,
                        author_role, author_instance_key, body_md, body_format, is_human_comment,
                        created_at, updated_at, is_deleted, deleted_at
                    )
                    SELECT
                        id, project_id, task_id, goal_checklist_item_id, parent_comment_id,
                        author_role, author_instance_key, body_md, body_format, is_human_comment,
                        created_at, updated_at, is_deleted, deleted_at
                    FROM comments_old
                    """
                )
            )
            connection.execute(text("DROP TABLE comments_old"))
            connection.execute(text("PRAGMA foreign_keys=ON"))


def create_schema() -> None:
    ensure_data_dir()
    from app.models import attachment, comment, dependency, goal, note, project, project_property, project_repo_link, tag, task, task_property, task_type  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_runtime_migrations()


def drop_schema() -> None:
    from app.models import attachment, comment, dependency, goal, note, project, project_property, project_repo_link, tag, task, task_property, task_type  # noqa: F401

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
