import re
import subprocess
import threading
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.models.project_repo_link import ProjectRepoLink
from app.services.errors import ValidationError
from app.services.project_properties import upsert_remote_repo_property
from app.services.projects import get_project
from app.services.utils import new_id

_PROGRESS_PATTERNS = [
    (re.compile(r"Receiving objects:\s+(\d+)%"), "Receiving objects"),
    (re.compile(r"Resolving deltas:\s+(\d+)%"), "Resolving deltas"),
    (re.compile(r"Compressing objects:\s+(\d+)%"), "Compressing objects"),
]
_ACTIVE_CLONES: set[str] = set()
_ACTIVE_CLONES_LOCK = threading.Lock()


def _repos_root() -> Path:
    settings = get_settings()
    return settings.common_volume_root / "repos"


def _repo_path(repo_subpath: str) -> Path:
    return _repos_root() / repo_subpath


def _serialize(link: ProjectRepoLink) -> dict:
    path = _repo_path(link.repo_subpath)
    return {
        "id": link.id,
        "project_id": link.project_id,
        "remote_url": link.remote_url,
        "repo_subpath": link.repo_subpath,
        "relative_repo_path": f"repos/{link.repo_subpath}",
        "absolute_repo_path": str(path),
        "clone_status": link.clone_status,
        "clone_progress": link.clone_progress,
        "clone_stage": link.clone_stage,
        "error_message": link.error_message,
        "created_at": link.created_at,
        "updated_at": link.updated_at,
    }


def _get_link(session: Session, project_id: str) -> ProjectRepoLink | None:
    get_project(session, project_id)
    return session.scalar(select(ProjectRepoLink).where(ProjectRepoLink.project_id == project_id))


def get_project_repo_link(session: Session, project_id: str) -> dict | None:
    link = _get_link(session, project_id)
    return _serialize(link) if link else None


def upsert_project_repo_link(session: Session, project_id: str, remote_url: str) -> dict:
    remote_url = remote_url.strip()
    if not remote_url:
        raise ValidationError("Remote repo is required")

    project = get_project(session, project_id)
    _repos_root().mkdir(parents=True, exist_ok=True)

    link = _get_link(session, project_id)
    if link is None:
        link = ProjectRepoLink(
            id=new_id(),
            project_id=project_id,
            remote_url=remote_url,
            repo_subpath=project.slug,
            clone_status="queued",
            clone_progress=0,
            clone_stage="Queued",
            error_message=None,
        )
        session.add(link)
    else:
        link.remote_url = remote_url
        link.repo_subpath = project.slug
        link.clone_status = "queued"
        link.clone_progress = 0
        link.clone_stage = "Queued"
        link.error_message = None

    upsert_remote_repo_property(session, project_id, remote_url)
    session.commit()
    session.refresh(link)
    _start_clone(link.id)
    return _serialize(link)


def _update_link(link_id: str, **fields) -> None:
    with SessionLocal() as session:
        link = session.get(ProjectRepoLink, link_id)
        if link is None:
            return
        for field, value in fields.items():
            setattr(link, field, value)
        session.commit()


def _parse_progress(line: str) -> tuple[str | None, int | None]:
    for pattern, stage in _PROGRESS_PATTERNS:
        match = pattern.search(line)
        if match:
            return stage, int(match.group(1))
    return None, None


def _run_clone(link_id: str) -> None:
    try:
        with SessionLocal() as session:
            link = session.get(ProjectRepoLink, link_id)
            if link is None:
                return
            repo_path = _repo_path(link.repo_subpath)
            remote_url = link.remote_url

        repo_path.parent.mkdir(parents=True, exist_ok=True)
        _update_link(link_id, clone_status="cloning", clone_progress=1, clone_stage="Preparing", error_message=None)

        if (repo_path / ".git").exists():
            subprocess.run(["git", "-C", str(repo_path), "remote", "set-url", "origin", remote_url], check=True)
            command = ["git", "-C", str(repo_path), "fetch", "--progress", "origin"]
        else:
            if repo_path.exists() and any(repo_path.iterdir()):
                raise RuntimeError(f"Repo folder already exists and is not empty: {repo_path}")
            command = ["git", "clone", "--progress", remote_url, str(repo_path)]

        process = subprocess.Popen(
            command,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        assert process.stderr is not None
        for raw_line in process.stderr:
            line = raw_line.strip()
            if not line:
                continue
            stage, progress = _parse_progress(line)
            if stage is not None and progress is not None:
                _update_link(link_id, clone_status="cloning", clone_progress=progress, clone_stage=stage, error_message=None)
            else:
                _update_link(link_id, clone_status="cloning", clone_stage=line[:255], error_message=None)
        return_code = process.wait()
        if return_code != 0:
            raise RuntimeError(f"git exited with status {return_code}")

        _update_link(link_id, clone_status="ready", clone_progress=100, clone_stage="Ready", error_message=None)
    except Exception as exc:  # noqa: BLE001
        _update_link(link_id, clone_status="failed", clone_stage="Failed", error_message=str(exc), clone_progress=0)
    finally:
        with _ACTIVE_CLONES_LOCK:
            _ACTIVE_CLONES.discard(link_id)


def _start_clone(link_id: str) -> None:
    with _ACTIVE_CLONES_LOCK:
        if link_id in _ACTIVE_CLONES:
            return
        _ACTIVE_CLONES.add(link_id)
    thread = threading.Thread(target=_run_clone, args=(link_id,), daemon=True)
    thread.start()
