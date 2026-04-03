import { useEffect, useState } from "react";
import { Bot } from "lucide-react";

import { fetchAgents, fetchAgentModels, updateAgentModel } from "../api";

export default function AgentsConfigScreen() {
  const [agents, setAgents] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modelsLoading, setModelsLoading] = useState(false);

  useEffect(() => {
    fetchAgents()
      .then((data) => {
        const enabled = data.filter((a) => a.is_enabled);
        setAgents(enabled);
        if (enabled.length > 0) setSelectedAgentId(enabled[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedAgentId) return;
    setModelsLoading(true);
    fetchAgentModels(selectedAgentId)
      .then(setModels)
      .finally(() => setModelsLoading(false));
  }, [selectedAgentId]);

  async function handleToggle(model) {
    const newEnabled = model.is_enabled === 1 ? false : true;
    try {
      const updated = await updateAgentModel(model.id, { is_enabled: newEnabled });
      setModels((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch {
      // silently fail
    }
  }

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  return (
    <section className="agents-config">
      <aside className="panel agents-config__list">
        <div className="panel__header">
          <div className="panel__header-row">
            <span className="panel__title">Agents</span>
          </div>
        </div>
        <div className="panel__body">
          {loading ? (
            <div className="empty-copy">Loading agents...</div>
          ) : agents.length === 0 ? (
            <div className="empty-copy">No agents configured.</div>
          ) : (
            <ul className="agents-config__agent-list">
              {agents.map((agent) => (
                <li key={agent.id}>
                  <button
                    type="button"
                    className={`agents-config__agent-row${agent.id === selectedAgentId ? " agents-config__agent-row--active" : ""}`}
                    onClick={() => setSelectedAgentId(agent.id)}
                  >
                    <Bot size={14} strokeWidth={2} />
                    <span>{agent.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
      <section className="panel agents-config__models">
        <div className="panel__header">
          <div className="panel__header-row">
            <span className="panel__title">
              {selectedAgent ? `${selectedAgent.name} — Models` : "Models"}
            </span>
          </div>
        </div>
        <div className="panel__body">
          {!selectedAgentId ? (
            <div className="empty-copy">Select an agent.</div>
          ) : modelsLoading ? (
            <div className="empty-copy">Loading models...</div>
          ) : models.length === 0 ? (
            <div className="empty-copy">No models configured for this agent.</div>
          ) : (
            <ul className="agents-config__model-list">
              {models.map((model) => (
                <li key={model.id} className="agents-config__model-row">
                  <label className="agents-config__model-label">
                    <input
                      type="checkbox"
                      checked={model.is_enabled === 1}
                      onChange={() => handleToggle(model)}
                      className="agents-config__checkbox"
                    />
                    <span className="agents-config__model-id">{model.model_id}</span>
                    {model.label ? (
                      <span className="agents-config__model-tag">{model.label}</span>
                    ) : null}
                    {model.is_default === 1 ? (
                      <span className="agents-config__model-tag agents-config__model-tag--default">default</span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </section>
  );
}
