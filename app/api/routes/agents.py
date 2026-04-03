from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.schemas.agent import (
    AgentCreate,
    AgentModelCreate,
    AgentModelRead,
    AgentModelUpdate,
    AgentRead,
    AgentUpdate,
)
from app.schemas.common import SoftDeleteResponse
from app.services import agents as agent_service

router = APIRouter(prefix="/api/agents", tags=["agents"])


# ── Agents ──────────────────────────────────────


@router.get("", response_model=list[AgentRead])
def list_agents(session: Session = Depends(get_session)):
    return agent_service.list_agents(session)


@router.post("", response_model=AgentRead, status_code=status.HTTP_201_CREATED)
def create_agent(payload: AgentCreate, session: Session = Depends(get_session)):
    return agent_service.create_agent(session, payload)


@router.get("/{agent_id}", response_model=AgentRead)
def get_agent(agent_id: str, session: Session = Depends(get_session)):
    return agent_service.get_agent(session, agent_id)


@router.patch("/{agent_id}", response_model=AgentRead)
def update_agent(agent_id: str, payload: AgentUpdate, session: Session = Depends(get_session)):
    return agent_service.update_agent(session, agent_id, payload)


@router.delete("/{agent_id}", response_model=SoftDeleteResponse)
def delete_agent(agent_id: str, session: Session = Depends(get_session)):
    return agent_service.delete_agent(session, agent_id)


# ── Agent Models ────────────────────────────────


@router.get("/{agent_id}/models", response_model=list[AgentModelRead])
def list_agent_models(agent_id: str, session: Session = Depends(get_session)):
    return agent_service.list_agent_models(session, agent_id)


@router.post("/{agent_id}/models", response_model=AgentModelRead, status_code=status.HTTP_201_CREATED)
def create_agent_model(agent_id: str, payload: AgentModelCreate, session: Session = Depends(get_session)):
    payload.agent_id = agent_id
    return agent_service.create_agent_model(session, payload)


@router.patch("/models/{model_id}", response_model=AgentModelRead)
def update_agent_model(model_id: str, payload: AgentModelUpdate, session: Session = Depends(get_session)):
    return agent_service.update_agent_model(session, model_id, payload)


@router.delete("/models/{model_id}", response_model=SoftDeleteResponse)
def delete_agent_model(model_id: str, session: Session = Depends(get_session)):
    return agent_service.delete_agent_model(session, model_id)
