from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.agent import Agent, AgentModel
from app.schemas.agent import AgentCreate, AgentModelCreate, AgentModelUpdate, AgentUpdate
from app.services.base import active, get_or_404, soft_delete
from app.services.utils import new_id


# ── Agents ──────────────────────────────────────


def list_agents(session: Session) -> list[Agent]:
    return list(session.scalars(active(select(Agent).order_by(Agent.created_at), Agent)))


def get_agent(session: Session, agent_id: str) -> Agent:
    return get_or_404(session, Agent, agent_id, "Agent not found")


def create_agent(session: Session, payload: AgentCreate) -> Agent:
    agent = Agent(
        id=new_id(),
        key=payload.key,
        name=payload.name,
        is_enabled=int(payload.is_enabled),
    )
    session.add(agent)
    session.commit()
    session.refresh(agent)
    return agent


def update_agent(session: Session, agent_id: str, payload: AgentUpdate) -> Agent:
    agent = get_agent(session, agent_id)
    data = payload.model_dump(exclude_unset=True)
    if "is_enabled" in data:
        data["is_enabled"] = int(data["is_enabled"])
    for field, value in data.items():
        setattr(agent, field, value)
    session.commit()
    session.refresh(agent)
    return agent


def delete_agent(session: Session, agent_id: str) -> Agent:
    agent = get_agent(session, agent_id)
    soft_delete(agent)
    session.commit()
    session.refresh(agent)
    return agent


# ── Agent Models ────────────────────────────────


def list_agent_models(session: Session, agent_id: str) -> list[AgentModel]:
    return list(
        session.scalars(
            active(
                select(AgentModel).where(AgentModel.agent_id == agent_id).order_by(AgentModel.created_at),
                AgentModel,
            )
        )
    )


def get_agent_model(session: Session, model_id: str) -> AgentModel:
    return get_or_404(session, AgentModel, model_id, "Agent model not found")


def create_agent_model(session: Session, payload: AgentModelCreate) -> AgentModel:
    get_agent(session, payload.agent_id)
    agent_model = AgentModel(
        id=new_id(),
        agent_id=payload.agent_id,
        model_id=payload.model_id,
        label=payload.label,
        is_default=int(payload.is_default),
    )
    session.add(agent_model)
    session.commit()
    session.refresh(agent_model)
    return agent_model


def update_agent_model(session: Session, model_id: str, payload: AgentModelUpdate) -> AgentModel:
    agent_model = get_agent_model(session, model_id)
    data = payload.model_dump(exclude_unset=True)
    if "is_default" in data:
        data["is_default"] = int(data["is_default"])
    if "is_enabled" in data:
        data["is_enabled"] = int(data["is_enabled"])
    for field, value in data.items():
        setattr(agent_model, field, value)
    session.commit()
    session.refresh(agent_model)
    return agent_model


def delete_agent_model(session: Session, model_id: str) -> AgentModel:
    agent_model = get_agent_model(session, model_id)
    soft_delete(agent_model)
    session.commit()
    session.refresh(agent_model)
    return agent_model
