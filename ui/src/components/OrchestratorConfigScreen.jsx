import { useEffect, useRef, useState } from "react";
import { GitBranch, GripVertical, Plus, Trash2 } from "lucide-react";

import {
  createWorkflow,
  deleteWorkflow,
  fetchHooks,
  fetchSkills,
  fetchWorkflowDetail,
  fetchWorkflows,
  updateWorkflow,
} from "../api";

const WORKFLOW_HOOK_EVENTS = [
  ["pre_workflow", "Pre Workflow"],
  ["post_workflow", "Post Workflow"],
  ["pre_phase", "Pre Phase"],
  ["post_phase", "Post Phase"],
  ["pre_step", "Pre Step"],
  ["step", "Step"],
  ["post_step", "Post Step"],
  ["on_workflow_pause", "On Workflow Pause"],
  ["on_workflow_continue", "On Workflow Continue"],
  ["on_step_timeout", "On Step Timeout"],
  ["on_step_user_kill", "On Step User Kill"],
];

const HOOK_FAILURE_POLICY_OPTIONS = [
  { value: "fail", label: "Fail" },
  { value: "warn_and_continue", label: "Warn and Continue" },
];

function emptyWorkflowHooks() {
  return Object.fromEntries(WORKFLOW_HOOK_EVENTS.map(([eventName]) => [eventName, []]));
}

function normalizeWorkflowHooks(hooks) {
  const base = emptyWorkflowHooks();
  if (!hooks || typeof hooks !== "object") return base;
  for (const [eventName] of WORKFLOW_HOOK_EVENTS) {
    const entries = Array.isArray(hooks[eventName]) ? hooks[eventName] : [];
    base[eventName] = entries
      .filter((entry) => entry && entry.asset_name)
      .map((entry) => ({
        asset_name: entry.asset_name,
        failure_policy: entry.failure_policy || "fail",
      }));
  }
  return base;
}

export default function OrchestratorConfigScreen() {
  const [workflows, setWorkflows] = useState([]);
  const [knownSkills, setKnownSkills] = useState([]);
  const [hookAssets, setHookAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedWorkflowName, setSelectedWorkflowName] = useState("");
  const [workflowForm, setWorkflowForm] = useState({ name: "", description: "", steps: [], hooks: emptyWorkflowHooks() });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveStateLabel, setSaveStateLabel] = useState("");
  const autosaveSnapshotRef = useRef("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [skillPickerPhaseIndex, setSkillPickerPhaseIndex] = useState(null);
  const [draggedPhaseIndex, setDraggedPhaseIndex] = useState(null);
  const [dropPhaseIndex, setDropPhaseIndex] = useState(null);
  const [hookAddSelections, setHookAddSelections] = useState({});

  useEffect(() => {
    let active = true;

    async function loadConfigData() {
      try {
        setLoading(true);
        const [summaries, skills, hooks] = await Promise.all([fetchWorkflows(), fetchSkills(), fetchHooks()]);
        if (!active) return;
        setWorkflows(summaries);
        setKnownSkills(skills);
        setHookAssets(hooks);
        setHookAddSelections((current) => {
          const next = { ...current };
          const defaultHook = hooks[0]?.name || "";
          for (const [eventName] of WORKFLOW_HOOK_EVENTS) {
            if (!next[eventName]) next[eventName] = defaultHook;
          }
          return next;
        });
        setError("");
        setSelectedWorkflowName((current) => current || summaries[0]?.name || "");
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || "Unable to load workflows.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadConfigData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadWorkflowDetail() {
      if (!selectedWorkflowName) {
        setWorkflowForm({ name: "", description: "", steps: [], hooks: emptyWorkflowHooks() });
        return;
      }

      try {
        const detail = await fetchWorkflowDetail(selectedWorkflowName);
        if (!active) return;
        const nextForm = {
          name: detail.name,
          description: detail.description || "",
          steps: detail.steps || [],
          hooks: normalizeWorkflowHooks(detail.hooks),
        };
        autosaveSnapshotRef.current = JSON.stringify(nextForm);
        setWorkflowForm(nextForm);
        setSaveError("");
        setSaveStateLabel("");
      } catch (loadError) {
        if (!active) return;
        setSaveError(loadError.message || "Unable to load workflow.");
      }
    }

    loadWorkflowDetail();
    return () => {
      active = false;
    };
  }, [selectedWorkflowName]);

  function addPhase() {
    setWorkflowForm((current) => ({
      ...current,
      steps: [...current.steps, []],
    }));
  }

  function removePhase(index) {
    setWorkflowForm((current) => ({
      ...current,
      steps: current.steps.filter((_, stepIndex) => stepIndex !== index),
    }));
  }

  function movePhase(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex == null || toIndex == null) return;
    setWorkflowForm((current) => {
      const nextSteps = [...current.steps];
      const [movedStep] = nextSteps.splice(fromIndex, 1);
      nextSteps.splice(toIndex, 0, movedStep);
      return {
        ...current,
        steps: nextSteps,
      };
    });
  }

  function addSkillToPhase(skillName) {
    if (skillPickerPhaseIndex == null) return;

    setWorkflowForm((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) => {
        if (stepIndex !== skillPickerPhaseIndex) return step;
        return step.includes(skillName) ? step : [...step, skillName];
      }),
    }));
  }

  function removeSkillFromPhase(phaseIndex, skillName) {
    setWorkflowForm((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) =>
        stepIndex === phaseIndex ? step.filter((name) => name !== skillName) : step,
      ),
    }));
  }

  function addHookToEvent(eventName) {
    const assetName = hookAddSelections[eventName];
    if (!assetName) return;
    setWorkflowForm((current) => ({
      ...current,
      hooks: {
        ...current.hooks,
        [eventName]: [...(current.hooks[eventName] || []), { asset_name: assetName, failure_policy: "fail" }],
      },
    }));
  }

  function updateHookEntry(eventName, entryIndex, nextEntry) {
    setWorkflowForm((current) => ({
      ...current,
      hooks: {
        ...current.hooks,
        [eventName]: (current.hooks[eventName] || []).map((entry, index) => (index === entryIndex ? nextEntry : entry)),
      },
    }));
  }

  function removeHookEntry(eventName, entryIndex) {
    setWorkflowForm((current) => ({
      ...current,
      hooks: {
        ...current.hooks,
        [eventName]: (current.hooks[eventName] || []).filter((_, index) => index !== entryIndex),
      },
    }));
  }

  function moveHookEntry(eventName, entryIndex, direction) {
    setWorkflowForm((current) => {
      const entries = [...(current.hooks[eventName] || [])];
      const targetIndex = entryIndex + direction;
      if (targetIndex < 0 || targetIndex >= entries.length) return current;
      const [entry] = entries.splice(entryIndex, 1);
      entries.splice(targetIndex, 0, entry);
      return {
        ...current,
        hooks: {
          ...current.hooks,
          [eventName]: entries,
        },
      };
    });
  }

  useEffect(() => {
    if (!selectedWorkflowName || !workflowForm.name) return undefined;

    const snapshot = JSON.stringify({
      name: workflowForm.name,
      description: workflowForm.description,
      steps: workflowForm.steps,
      hooks: normalizeWorkflowHooks(workflowForm.hooks),
    });
    if (snapshot === autosaveSnapshotRef.current) {
      return undefined;
    }

    setSaveStateLabel("Saving...");
    setSaveError("");
    const timeoutId = window.setTimeout(async () => {
      setSaving(true);
      try {
        const updated = await updateWorkflow(workflowForm.name, {
          description: workflowForm.description,
          steps: workflowForm.steps,
          hooks: normalizeWorkflowHooks(workflowForm.hooks),
        });
        const nextForm = {
          name: updated.name,
          description: updated.description || "",
          steps: updated.steps || [],
          hooks: normalizeWorkflowHooks(updated.hooks),
        };
        autosaveSnapshotRef.current = JSON.stringify(nextForm);
        setWorkflowForm(nextForm);
        setWorkflows((current) =>
          current.map((workflow) =>
            workflow.name === updated.name
              ? { ...workflow, description: updated.description || "" }
              : workflow,
          ),
        );
        setSaveStateLabel("Saved");
      } catch (saveWorkflowError) {
        setSaveError(saveWorkflowError.message || "Unable to save workflow.");
        setSaveStateLabel("");
      } finally {
        setSaving(false);
      }
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [selectedWorkflowName, workflowForm]);

  async function handleDeleteWorkflow() {
    if (!selectedWorkflowName) return;

    setDeleting(true);
    setSaveError("");
    try {
      const remainingWorkflows = workflows.filter((workflow) => workflow.name !== selectedWorkflowName);
      await deleteWorkflow(selectedWorkflowName);
      setWorkflows(remainingWorkflows);
      setSelectedWorkflowName(remainingWorkflows[0]?.name || "");
      setWorkflowForm({ name: "", description: "", steps: [], hooks: emptyWorkflowHooks() });
    } catch (deleteError) {
      setSaveError(deleteError.message || "Unable to delete workflow.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreateWorkflow(event) {
    event.preventDefault();
    const name = createForm.name.trim();
    if (!name) {
      setCreateError("Workflow name is required.");
      return;
    }

    setCreating(true);
    setCreateError("");
    try {
      const created = await createWorkflow({
        name,
        description: createForm.description.trim(),
        steps: [],
        hooks: emptyWorkflowHooks(),
      });
      setWorkflows((current) => [...current, { name: created.name, description: created.description || "" }]);
      setSelectedWorkflowName(created.name);
      setCreateDialogOpen(false);
      setCreateForm({ name: "", description: "" });
    } catch (createWorkflowError) {
      setCreateError(createWorkflowError.message || "Unable to create workflow.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <section className="orchestrator-config">
        <aside className="panel orchestrator-config__list">
          <div className="orchestrator-config__toolbar">
            <button type="button" className="primary-button" onClick={() => setCreateDialogOpen(true)}>
              New Workflow
            </button>
          </div>

          {loading ? (
            <div className="skills-config__empty">
              <div className="skills-config__empty-title">Loading workflows...</div>
            </div>
          ) : error ? (
            <div className="skills-config__empty">
              <div className="skills-config__empty-title">Unable to load workflows.</div>
              <p className="skills-config__empty-copy">{error}</p>
            </div>
          ) : workflows.length ? (
            <div className="orchestrator-list">
              {workflows.map((workflow) => (
                <button
                  key={workflow.name}
                  type="button"
                  className={`orchestrator-list__item${workflow.name === selectedWorkflowName ? " orchestrator-list__item--selected" : ""}`}
                  onClick={() => setSelectedWorkflowName(workflow.name)}
                >
                  <span className="orchestrator-list__item-icon" aria-hidden="true">
                    <GitBranch size={13} strokeWidth={2.1} />
                  </span>
                  <span className="orchestrator-list__item-copy">
                    <span className="orchestrator-list__item-name">{workflow.name}</span>
                    <span className="orchestrator-list__item-description">{workflow.description || "No description yet."}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="skills-config__empty">
              <div className="skills-config__empty-title">No workflows configured yet.</div>
              <p className="skills-config__empty-copy">
                Create one to define ordered execution phases for orchestrated step runs.
              </p>
            </div>
          )}
        </aside>

        <section className="panel orchestrator-config__editor">
          {selectedWorkflowName ? (
            <>
              <div className="orchestrator-config__editor-toolbar">
                <div>
                  <div className="orchestrator-config__title">{workflowForm.name}</div>
                  <div className="orchestrator-config__subtitle">Workflow phases execute in order. Hooks fire at fixed orchestration lifecycle points.</div>
                </div>
                <div className="orchestrator-config__actions">
                  {saveStateLabel ? <div className="panel__subtitle">{saveStateLabel}</div> : null}
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Delete workflow"
                    onClick={handleDeleteWorkflow}
                    disabled={saving || deleting}
                  >
                    <Trash2 size={12} strokeWidth={2.1} />
                  </button>
                </div>
              </div>

              <div className="orchestrator-config__surface">
                <label className="field">
                  <span className="field__label">Description</span>
                  <textarea
                    className="field__input field__input--textarea"
                    value={workflowForm.description}
                    onChange={(event) =>
                      setWorkflowForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    rows={4}
                    placeholder="Describe what this workflow does."
                  />
                </label>

                <div className="orchestrator-config__section">
                  <div className="orchestrator-config__section-header">
                    <div className="field__label">Phases</div>
                    <button type="button" className="secondary-button" onClick={addPhase}>
                      <Plus size={12} strokeWidth={2.1} />
                      <span>Add Phase</span>
                    </button>
                  </div>

                  {workflowForm.steps.length ? (
                    <div className="workflow-phases">
                      {workflowForm.steps.map((step, index) => (
                        <div
                          className={`workflow-phase${draggedPhaseIndex === index ? " workflow-phase--dragging" : ""}${dropPhaseIndex === index ? " workflow-phase--drop-target" : ""}`}
                          key={`${workflowForm.name}-phase-${index}`}
                          draggable
                          onDragStart={(event) => {
                            setDraggedPhaseIndex(index);
                            setDropPhaseIndex(index);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", String(index));
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            if (dropPhaseIndex !== index) {
                              setDropPhaseIndex(index);
                            }
                            event.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            const fromIndex = draggedPhaseIndex ?? Number(event.dataTransfer.getData("text/plain"));
                            movePhase(fromIndex, index);
                            setDraggedPhaseIndex(null);
                            setDropPhaseIndex(null);
                          }}
                          onDragEnd={() => {
                            setDraggedPhaseIndex(null);
                            setDropPhaseIndex(null);
                          }}
                        >
                          <div className="workflow-phase__header">
                            <div className="workflow-phase__heading">
                              <div className="workflow-phase__title-row">
                                <span className="workflow-phase__drag-handle" aria-hidden="true">
                                  <GripVertical size={14} strokeWidth={2} />
                                </span>
                                <div className="workflow-phase__title">Phase {index + 1}</div>
                              </div>
                            </div>
                            <div className="workflow-phase__actions">
                              <button type="button" className="secondary-button" onClick={() => setSkillPickerPhaseIndex(index)}>
                                Add Skills
                              </button>
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={`Remove phase ${index + 1}`}
                                onClick={() => removePhase(index)}
                              >
                                <Trash2 size={12} strokeWidth={2.1} />
                              </button>
                            </div>
                          </div>
                          <div className="workflow-phase__chips">
                            {step.length ? (
                              step.map((skillName) => (
                                <span className="workflow-phase__chip" key={`${workflowForm.name}-${index}-${skillName}`}>
                                  <span>{skillName}</span>
                                  <button
                                    type="button"
                                    className="workflow-phase__chip-remove"
                                    aria-label={`Remove ${skillName} from phase ${index + 1}`}
                                    onClick={() => removeSkillFromPhase(index, skillName)}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))
                            ) : (
                              <span className="workflow-phase__chip workflow-phase__chip--empty">No skills in this phase yet.</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-copy">No phases yet. Add the first phase to start composing the workflow.</div>
                  )}
                </div>

                <div className="orchestrator-config__section">
                  <div className="orchestrator-config__section-header">
                    <div className="field__label">Hooks</div>
                  </div>

                  <div className="workflow-hooks">
                    {WORKFLOW_HOOK_EVENTS.map(([eventName, label]) => {
                      const entries = workflowForm.hooks[eventName] || [];
                      const selectedAsset = hookAddSelections[eventName] || "";
                      return (
                        <div className="workflow-hooks__event" key={eventName}>
                          <div className="workflow-hooks__event-header">
                            <div className="workflow-hooks__event-title">{label}</div>
                            <div className="workflow-hooks__event-add">
                              <select
                                className="field__input workflow-hooks__select"
                                value={selectedAsset}
                                onChange={(event) =>
                                  setHookAddSelections((current) => ({ ...current, [eventName]: event.target.value }))
                                }
                              >
                                <option value="">Select script</option>
                                {hookAssets.map((hook) => (
                                  <option key={`${eventName}-${hook.name}`} value={hook.name}>
                                    {hook.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => addHookToEvent(eventName)}
                                disabled={!selectedAsset}
                              >
                                Add
                              </button>
                            </div>
                          </div>

                          {entries.length ? (
                            <div className="workflow-hooks__list">
                              {entries.map((entry, entryIndex) => (
                                <div className="workflow-hooks__item" key={`${eventName}-${entry.asset_name}-${entryIndex}`}>
                                  <div className="workflow-hooks__item-main">
                                    <div className="workflow-hooks__item-name">{entry.asset_name}</div>
                                    <div className="workflow-hooks__item-meta">Runs in list order</div>
                                  </div>
                                  <select
                                    className="field__input workflow-hooks__policy"
                                    value={entry.failure_policy}
                                    onChange={(event) =>
                                      updateHookEntry(eventName, entryIndex, {
                                        ...entry,
                                        failure_policy: event.target.value,
                                      })
                                    }
                                  >
                                    {HOOK_FAILURE_POLICY_OPTIONS.map((option) => (
                                      <option key={`${eventName}-${entryIndex}-${option.value}`} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                  <div className="workflow-hooks__item-actions">
                                    <button
                                      type="button"
                                      className="icon-button"
                                      aria-label="Move hook up"
                                      onClick={() => moveHookEntry(eventName, entryIndex, -1)}
                                      disabled={entryIndex === 0}
                                    >
                                      <span aria-hidden="true">↑</span>
                                    </button>
                                    <button
                                      type="button"
                                      className="icon-button"
                                      aria-label="Move hook down"
                                      onClick={() => moveHookEntry(eventName, entryIndex, 1)}
                                      disabled={entryIndex === entries.length - 1}
                                    >
                                      <span aria-hidden="true">↓</span>
                                    </button>
                                    <button
                                      type="button"
                                      className="icon-button"
                                      aria-label="Remove hook"
                                      onClick={() => removeHookEntry(eventName, entryIndex)}
                                    >
                                      <Trash2 size={12} strokeWidth={2.1} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="empty-copy">No scripts attached to this lifecycle event yet.</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {saveError ? <div className="banner banner--error">{saveError}</div> : null}
              </div>
            </>
          ) : (
            <div className="skills-config__empty">
              <div className="skills-config__empty-title">Select a workflow.</div>
              <p className="skills-config__empty-copy">
                Choose a workflow from the list or create a new one to edit its phases.
              </p>
            </div>
          )}
        </section>
      </section>

      {createDialogOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setCreateDialogOpen(false)}>
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workflow-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel__header">
              <div className="panel__title" id="workflow-dialog-title">
                New Workflow
              </div>
            </div>

            <form className="modal-form" onSubmit={handleCreateWorkflow}>
              <label className="field">
                <span className="field__label">Workflow Name</span>
                <input
                  className="field__input"
                  value={createForm.name}
                  onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="market-research-pipeline"
                  autoFocus
                />
              </label>

              <label className="field">
                <span className="field__label">Description</span>
                <textarea
                  className="field__input field__input--textarea"
                  value={createForm.description}
                  onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
                  rows={4}
                  placeholder="Short description of the workflow."
                />
              </label>

              {createError ? <div className="banner banner--error">{createError}</div> : null}

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setCreateDialogOpen(false)} disabled={creating}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={creating}>
                  {creating ? "Creating..." : "Create Workflow"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {skillPickerPhaseIndex != null ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSkillPickerPhaseIndex(null)}>
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workflow-skill-picker-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel__header">
              <div>
                <div className="panel__title" id="workflow-skill-picker-title">
                  Add Skills To Phase {skillPickerPhaseIndex + 1}
                </div>
                <div className="panel__subtitle">Choose from the known orchestrator skill list.</div>
              </div>
            </div>

            <div className="workflow-skill-picker">
              {knownSkills.length ? (
                knownSkills.map((skill) => {
                  const alreadyAdded = workflowForm.steps[skillPickerPhaseIndex]?.includes(skill.name);

                  return (
                    <button
                      key={skill.name}
                      type="button"
                      className={`workflow-skill-picker__item${alreadyAdded ? " workflow-skill-picker__item--selected" : ""}`}
                      onClick={() => addSkillToPhase(skill.name)}
                    >
                      <span className="workflow-skill-picker__name">{skill.name}</span>
                      <span className="workflow-skill-picker__description">
                        {skill.description || (alreadyAdded ? "Already in this phase." : "No description yet.")}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="skills-config__empty">
                  <div className="skills-config__empty-title">No skills available.</div>
                </div>
              )}
            </div>

            <div className="workflow-skill-picker__footer">
              <button type="button" className="secondary-button workflow-skill-picker__done" onClick={() => setSkillPickerPhaseIndex(null)}>
                Done
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
