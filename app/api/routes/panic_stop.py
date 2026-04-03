from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_session
from app.services import panic_stop as service

router = APIRouter(prefix="/api/panic-stop", tags=["panic-stop"])


class PanicStopResponse(BaseModel):
    process_count: int
    paused_count: int
    task_reset_count: int
    tmux_killed_count: int
    pending_cleared_count: int
    errors: list[str]


@router.post("", response_model=PanicStopResponse)
def panic_stop(session: Session = Depends(get_session)):
    result = service.panic_stop(session)
    return PanicStopResponse(
        process_count=result.process_count,
        paused_count=result.paused_count,
        task_reset_count=result.task_reset_count,
        tmux_killed_count=result.tmux_killed_count,
        pending_cleared_count=result.pending_cleared_count,
        errors=result.errors,
    )


@router.post("/{process_id}", response_model=PanicStopResponse)
def stop_process(process_id: str, session: Session = Depends(get_session)):
    result = service.stop_process(session, process_id)
    return PanicStopResponse(
        process_count=result.process_count,
        paused_count=result.paused_count,
        task_reset_count=result.task_reset_count,
        tmux_killed_count=result.tmux_killed_count,
        pending_cleared_count=result.pending_cleared_count,
        errors=result.errors,
    )
