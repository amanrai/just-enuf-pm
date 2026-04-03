import json
import subprocess
from dataclasses import dataclass
from urllib import error, request

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.task import Task
from app.services.base import active


@dataclass
class PanicStopResult:
    process_count: int
    paused_count: int
    task_reset_count: int
    tmux_killed_count: int
    pending_cleared_count: int
    errors: list[str]


def _orchestrator_request(path: str, method: str = "GET", payload: dict | None = None):
    settings = get_settings()
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    req = request.Request(
        f"{settings.orchestrator_api_base}{path}",
        data=body,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    with request.urlopen(req, timeout=5) as response:
        raw = response.read()
    if not raw:
        return None
    return json.loads(raw.decode("utf-8"))


def _kill_tmux_session(session_name: str) -> bool:
    result = subprocess.run(
        ["tmux", "kill-session", "-t", session_name],
        check=False,
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def _resolve_step_session(step: dict) -> str:
    detail = step.get("detail") or {}
    return (
        detail.get("session_id")
        or detail.get("tmux_session")
        or detail.get("session")
        or detail.get("tmuxSession")
        or detail.get("sessionName")
        or step.get("tmux_session")
        or ""
    )


def _load_active_process_summaries() -> list[dict]:
    try:
        process_summaries = _orchestrator_request("/processes") or []
    except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Unable to reach orchestrator: {exc}") from exc

    return [
        process for process in process_summaries
        if process.get("status") not in {"completed", "failed"}
    ]


def _load_process_detail(process_id: str) -> dict:
    try:
        return _orchestrator_request(f"/processes/{process_id}") or {"id": process_id}
    except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Unable to reach orchestrator: {exc}") from exc


def _load_process_details(process_summaries: list[dict], errors: list[str]) -> list[dict]:
    process_details: list[dict] = []
    for summary in process_summaries:
        process_id = summary.get("id")
        if not process_id:
            continue
        try:
            process_details.append(_orchestrator_request(f"/processes/{process_id}") or summary)
        except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            errors.append(f"Failed to fetch process {process_id}: {exc}")
            process_details.append(summary)
    return process_details


def _pause_processes(process_details: list[dict], errors: list[str]) -> int:
    paused_count = 0
    for detail in process_details:
        process_id = detail.get("id")
        if not process_id:
            continue
        try:
            _orchestrator_request(f"/processes/{process_id}/pause", method="POST")
            paused_count += 1
        except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            errors.append(f"Failed to pause process {process_id}: {exc}")
    return paused_count


def _kill_process_tmux_sessions(process_details: list[dict], errors: list[str]) -> tuple[int, set[str]]:
    tmux_killed_count = 0
    tmux_sessions = {
        _resolve_step_session(step)
        for detail in process_details
        for phase in detail.get("phases", [])
        for step in phase.get("steps", [])
        if _resolve_step_session(step)
    }
    for session_name in sorted(tmux_sessions):
        try:
            if _kill_tmux_session(session_name):
                tmux_killed_count += 1
            else:
                errors.append(f"Failed to kill tmux session {session_name}")
        except FileNotFoundError:
            errors.append("tmux is not installed on the PM API host")
            break
        except Exception as exc:  # pragma: no cover
            errors.append(f"Failed to kill tmux session {session_name}: {exc}")
    return tmux_killed_count, {name for name in tmux_sessions if name}


def _reset_process_tasks(session: Session, process_details: list[dict]) -> int:
    task_reset_count = 0
    task_ids = {detail.get("task_id") for detail in process_details if detail.get("task_id")}
    if not task_ids:
        return 0

    tasks = list(session.scalars(active(select(Task).where(Task.id.in_(task_ids)), Task)))
    for task in tasks:
        if task.status != "unopened":
            task.status = "unopened"
            task_reset_count += 1
    session.commit()
    return task_reset_count


def _clear_pending_messages(process_ids: set[str], tmux_sessions: set[str], errors: list[str]) -> int:
    pending_cleared_count = 0
    try:
        pending_messages = _orchestrator_request("/messaging/pending") or []
    except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        errors.append(f"Failed to list pending messages: {exc}")
        return 0

    for message in pending_messages:
        message_id = message.get("message_id")
        if not message_id:
            continue

        should_clear = False
        if process_ids and message.get("process_id") in process_ids:
            should_clear = True
        if tmux_sessions and message.get("session_id") in tmux_sessions:
            should_clear = True
        if not should_clear:
            continue

        try:
            _orchestrator_request(
                f"/messaging/{message_id}/respond",
                method="POST",
                payload={"response": "Execution halted and session closed."},
            )
            pending_cleared_count += 1
        except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            errors.append(f"Failed to clear pending message {message_id}: {exc}")
    return pending_cleared_count


def _stop_process_details(session: Session, process_details: list[dict]) -> PanicStopResult:
    errors: list[str] = []
    paused_count = _pause_processes(process_details, errors)
    tmux_killed_count, tmux_sessions = _kill_process_tmux_sessions(process_details, errors)
    task_reset_count = _reset_process_tasks(session, process_details)
    process_ids = {detail.get("id") for detail in process_details if detail.get("id")}
    pending_cleared_count = _clear_pending_messages(process_ids, tmux_sessions, errors)
    return PanicStopResult(
        process_count=len(process_details),
        paused_count=paused_count,
        task_reset_count=task_reset_count,
        tmux_killed_count=tmux_killed_count,
        pending_cleared_count=pending_cleared_count,
        errors=errors,
    )


def stop_process(session: Session, process_id: str) -> PanicStopResult:
    process_detail = _load_process_detail(process_id)
    return _stop_process_details(session, [process_detail])


def panic_stop(session: Session) -> PanicStopResult:
    active_summaries = _load_active_process_summaries()
    process_details = _load_process_details(active_summaries, [])
    return _stop_process_details(session, process_details)
