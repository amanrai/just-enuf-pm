const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";
const ORCHESTRATOR_API_BASE =
  import.meta.env.VITE_ORCHESTRATOR_API_BASE_URL || "http://127.0.0.1:8101";
const TMUXER_API_BASE = import.meta.env.VITE_TMUXER_BASE_URL || "http://localhost:5678";
const STT_API_BASE = import.meta.env.VITE_STT_BASE_URL || "http://127.0.0.1:8210";
const SECRETS_API_BASE = import.meta.env.VITE_SECRETS_BASE_URL || "http://127.0.0.1:8211";

async function buildRequestError(response, fallbackPrefix = "Request failed") {
  let detail = "";
  try {
    const data = await response.clone().json();
    if (typeof data?.detail === "string") {
      detail = data.detail;
    } else if (Array.isArray(data?.detail)) {
      detail = data.detail.map((item) => item?.msg || item?.detail || JSON.stringify(item)).join(", ");
    }
  } catch {
    try {
      const text = await response.text();
      if (text) {
        detail = text;
      }
    } catch {
      // ignore secondary parse failure
    }
  }
  const message = detail ? `${fallbackPrefix}: ${detail}` : `${fallbackPrefix}: ${response.status}`;
  const error = new Error(message);
  error.status = response.status;
  error.detail = detail;
  return error;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  if (!response.ok) {
    throw await buildRequestError(response);
  }
  return response.json();
}

async function orchestratorRequest(path, options = {}) {
  const response = await fetch(`${ORCHESTRATOR_API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  if (!response.ok) {
    throw await buildRequestError(response);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

async function orchestratorTextRequest(path, options = {}) {
  const response = await fetch(`${ORCHESTRATOR_API_BASE}${path}`, {
    headers: {
      ...(options.headers || {}),
    },
    ...options,
  });
  if (!response.ok) {
    throw await buildRequestError(response);
  }
  return response.text();
}

function normalizeHookEventNames(hooks) {
  if (!hooks || typeof hooks !== "object") return hooks;
  return {
    pre_workflow: hooks.pre_workflow || [],
    post_workflow: hooks.post_workflow || hooks.post_workflow_finish || [],
    pre_phase: hooks.pre_phase || [],
    post_phase: hooks.post_phase || hooks.post_phase_finish || [],
    pre_step: hooks.pre_step || hooks.pre_skill || [],
    step: hooks.step || [],
    post_step: hooks.post_step || hooks.post_skill_finish || [],
    on_workflow_pause: hooks.on_workflow_pause || [],
    on_workflow_continue: hooks.on_workflow_continue || [],
    on_step_timeout: hooks.on_step_timeout || [],
    on_step_user_kill: hooks.on_step_user_kill || [],
  };
}

function normalizeProcessStep(step) {
  if (!step) return step;
  const sessions = Array.isArray(step.tmux_sessions)
    ? step.tmux_sessions.filter((session) => session && !session.startsWith("orch-"))
    : [];
  const primarySession = sessions.length ? sessions[sessions.length - 1] : "";
  return {
    ...step,
    skill: step.skill || step.name || "",
    agent: step.agent || step.executor_label || step.config?.executor_label || "",
    tmux_session: step.tmux_session || primarySession,
  };
}

function normalizeProcessPhase(phase) {
  if (!phase) return phase;
  return {
    ...phase,
    index: phase.index ?? phase.number ?? 0,
    steps: Array.isArray(phase.steps) ? phase.steps.map(normalizeProcessStep) : [],
  };
}

function normalizeProcess(process) {
  if (!process) return process;
  const phases = Array.isArray(process.phases) ? process.phases.map(normalizeProcessPhase) : [];
  const currentSessionName = (
    process.current_session_name && !process.current_session_name.startsWith("orch-")
      ? process.current_session_name
      : phases.flatMap((phase) => phase.steps || [])
        .map((step) => step.tmux_session || "")
        .filter(Boolean)
        .at(-1)
  ) || "";
  return {
    ...process,
    id: process.id || process.workflow_uuid,
    phases,
    current_session_name: currentSessionName,
  };
}

async function secretsRequest(path, options = {}) {
  const response = await fetch(`${SECRETS_API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  if (!response.ok) {
    throw await buildRequestError(response);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

export async function fetchProjects() {
  return request("/projects");
}

export async function fetchProject(projectId) {
  return request(`/projects/${projectId}`);
}

export async function fetchProjectTasks(projectId) {
  return request(`/projects/${projectId}/tasks`);
}

export async function fetchTasksByTag(tag) {
  return request(`/tasks?tag=${encodeURIComponent(tag)}`);
}

export async function fetchTasksByTagAndStatus(tag, status) {
  const params = new URLSearchParams();
  if (tag) params.set("tag", tag);
  if (status) params.set("status", status);
  return request(`/tasks?${params.toString()}`);
}

export async function fetchTags() {
  return request("/tags");
}

export async function addTaskTag(taskId, name) {
  return request(`/tags/tasks/${taskId}`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function removeTaskTag(taskId, tagName) {
  return request(`/tags/tasks/${taskId}/${encodeURIComponent(tagName)}`, {
    method: "DELETE",
  });
}

export async function fetchProjectSubprojects(projectId) {
  return request(`/projects/${projectId}/subprojects`);
}

export async function fetchSecretKeys() {
  return request('/secret-keys');
}

export async function createSecretKey(payload) {
  return request('/secret-keys', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateSecretKey(secretKeyId, payload) {
  return request(`/secret-keys/${secretKeyId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function revealSecretKeyValue(secretKeyId) {
  return request(`/secret-keys/${secretKeyId}/value`);
}

export async function deleteSecretKey(secretKeyId) {
  return request(`/secret-keys/${secretKeyId}`, {
    method: 'DELETE',
  });
}

export async function fetchSecretBundles() {
  return request('/secret-bundles');
}

export async function createSecretBundle(payload) {
  return request('/secret-bundles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function upsertNamedSecret(payload) {
  return secretsRequest("/upsertNamedSecret", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteNamedSecret(payload) {
  return secretsRequest("/deleteNamedSecret", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getNamesOfSecretsByType(userDefinedType) {
  return secretsRequest("/getNamesOfSecretsByType", {
    method: "POST",
    body: JSON.stringify({ user_defined_type: userDefinedType }),
  });
}

export async function fetchSecrets() {
  return secretsRequest("/secrets");
}

export async function fetchSecretsStatus() {
  return secretsRequest("/status");
}

export async function unlockSecrets(passphrase, unlockTtlSeconds = 3600) {
  return secretsRequest("/unlock", {
    method: "POST",
    body: JSON.stringify({
      passphrase,
      unlock_ttl_seconds: unlockTtlSeconds,
    }),
  });
}

export async function lockSecrets() {
  return secretsRequest("/lock", {
    method: "POST",
  });
}

export async function updateSecretBundle(bundleId, payload) {
  return request(`/secret-bundles/${bundleId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteSecretBundle(bundleId) {
  return request(`/secret-bundles/${bundleId}`, {
    method: 'DELETE',
  });
}

export async function fetchProjectProperties(projectId) {
  return request(`/projects/${projectId}/properties`);
}

export async function fetchTaskProperties(taskId) {
  return request(`/tasks/${taskId}/properties`);
}

export async function fetchProjectRepoLink(projectId) {
  return request(`/projects/${projectId}/repo-link`);
}

export async function saveProjectRepoLink(projectId, payload) {
  return request(`/projects/${projectId}/repo-link`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function createProjectProperty(payload) {
  return request('/project-properties', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateProjectProperty(propertyId, payload) {
  return request(`/project-properties/${propertyId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function createTaskProperty(payload) {
  return request('/task-properties', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateTaskProperty(propertyId, payload) {
  return request(`/task-properties/${propertyId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteTaskProperty(propertyId) {
  return request(`/task-properties/${propertyId}`, {
    method: 'DELETE',
  });
}

export async function fetchTaskTypes(projectId) {
  return request(`/task-types?project_id=${projectId}`);
}

export async function createProject(payload) {
  return request("/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateProject(projectId, payload) {
  return request(`/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteProject(projectId) {
  return request(`/projects/${projectId}`, {
    method: "DELETE",
  });
}

export async function createSubproject(projectId, payload) {
  return request(`/projects/${projectId}/subprojects`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function reorderProjectTasks(projectId, taskIds) {
  return request(`/projects/${projectId}/tasks/reorder`, {
    method: "POST",
    body: JSON.stringify({ task_ids: taskIds }),
  });
}

export async function createTask(payload) {
  return request("/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTask(taskId, payload) {
  return request(`/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteTask(taskId) {
  return request(`/tasks/${taskId}`, {
    method: "DELETE",
  });
}

export async function fetchTask(taskId) {
  return request(`/tasks/${taskId}`);
}

export async function fetchProjectComments(projectId) {
  return request(`/projects/${projectId}/comments`);
}

export async function fetchTaskComments(taskId) {
  return request(`/tasks/${taskId}/comments`);
}

export async function createComment(payload) {
  return request("/comments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchAgents() {
  return request("/agents");
}

export async function fetchAgentModels(agentId) {
  return request(`/agents/${agentId}/models`);
}

export async function updateAgentModel(modelId, payload) {
  return request(`/agents/models/${modelId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function fetchSkills() {
  return orchestratorRequest("/skills");
}

export async function createSkill(payload) {
  return orchestratorRequest("/skills", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchSkillDetail(name) {
  return orchestratorRequest(`/skills/${encodeURIComponent(name)}`);
}

export async function fetchSkillFile(name, path) {
  return orchestratorRequest(`/skills/${encodeURIComponent(name)}/files/${encodeURIComponent(path)}`);
}

export async function updateSkillFile(name, path, content) {
  return orchestratorRequest(`/skills/${encodeURIComponent(name)}/files/${encodeURIComponent(path)}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export async function fetchWorkflows() {
  return orchestratorRequest("/workflows");
}

export async function fetchWorkflowDetail(name) {
  const detail = await orchestratorRequest(`/workflows/${encodeURIComponent(name)}`);
  return {
    ...detail,
    hooks: normalizeHookEventNames(detail.hooks),
  };
}

export async function createWorkflow(payload) {
  const created = await orchestratorRequest("/workflows", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      hooks: normalizeHookEventNames(payload.hooks),
    }),
  });
  return {
    ...created,
    hooks: normalizeHookEventNames(created.hooks),
  };
}

export async function updateWorkflow(name, payload) {
  const updated = await orchestratorRequest(`/workflows/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify({
      ...payload,
      hooks: normalizeHookEventNames(payload.hooks),
    }),
  });
  return {
    ...updated,
    hooks: normalizeHookEventNames(updated.hooks),
  };
}

export async function deleteWorkflow(name) {
  return orchestratorRequest(`/workflows/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

export async function fetchHooks() {
  return orchestratorRequest("/hooks");
}

export async function fetchHookDetail(name) {
  return orchestratorRequest(`/hooks/${encodeURIComponent(name)}`);
}

export async function createHook(payload) {
  return orchestratorRequest("/hooks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateHook(name, payload) {
  return orchestratorRequest(`/hooks/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteHook(name) {
  return orchestratorRequest(`/hooks/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

const PROJECT_IDENTITIES_PROPERTY_KEY = "project_identities";
const PROJECT_ENVIRONMENT_VARIABLES_PROPERTY_KEY = "project_environment_variables";

function parseProjectSelectionProperty(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

export async function createProcess(payload) {
  const task = payload.task_id ? await fetchTask(payload.task_id) : null;
  const project = task?.project_id ? await fetchProject(task.project_id) : null;
  const projectProperties = task?.project_id ? await fetchProjectProperties(task.project_id).catch(() => []) : [];
  const repoLink = task?.project_id ? await fetchProjectRepoLink(task.project_id).catch(() => null) : null;
  const projectPropertyMap = Object.fromEntries((projectProperties || []).map((property) => [property.key, property.value]));
  const propertyIdentities = parseProjectSelectionProperty(projectPropertyMap[PROJECT_IDENTITIES_PROPERTY_KEY]);
  const propertyEnvironmentVariables = parseProjectSelectionProperty(
    projectPropertyMap[PROJECT_ENVIRONMENT_VARIABLES_PROPERTY_KEY],
  );
  const associatedIdentities = Array.isArray(payload.project_identities_associated) && payload.project_identities_associated.length > 0
    ? payload.project_identities_associated
    : propertyIdentities;
  const associatedEnvironmentVariables = Array.isArray(payload.project_environment_variables_associated)
    && payload.project_environment_variables_associated.length > 0
    ? payload.project_environment_variables_associated
    : propertyEnvironmentVariables;
  const normalizedProjectPropertyMap = { ...projectPropertyMap };
  delete normalizedProjectPropertyMap[PROJECT_IDENTITIES_PROPERTY_KEY];
  delete normalizedProjectPropertyMap[PROJECT_ENVIRONMENT_VARIABLES_PROPERTY_KEY];
  const stepConfigs = {};
  Object.entries(payload.steps || {}).forEach(([phaseIndex, entries]) => {
    stepConfigs[Number(phaseIndex)] = Object.fromEntries(
      (entries || []).map((entry) => [
        entry.skill,
        {
          executor_label: entry.agent || "",
          model: entry.model || "",
        },
      ]),
    );
  });
  const created = await orchestratorRequest("/processes", {
    method: "POST",
    body: JSON.stringify({
      task_id: payload.task_id || null,
      workflow_name: payload.workflow_name,
      project_name: project?.name || "Untitled Project",
      project_base_repo_path_relative_to_common_volume: repoLink?.relative_repo_path || "",
      project_identities_associated: associatedIdentities,
      project_environment_variables_associated: associatedEnvironmentVariables,
      additional_caller_info: {
        project_name: project?.name || "Untitled Project",
        ticket_name: task?.title || task?.name || "",
        task_description: task?.description_md || "",
        task_id: payload.task_id || null,
        project_base_repo_path_relative_to_common_volume: repoLink?.relative_repo_path || "",
        project_identities_associated: associatedIdentities,
        project_environment_variables_associated: associatedEnvironmentVariables,
        project_properties: normalizedProjectPropertyMap,
      },
      step_configs: stepConfigs,
    }),
  });
  return normalizeProcess(created);
}

export async function fetchProcesses() {
  const items = await orchestratorRequest("/processes");
  return Array.isArray(items) ? items.map(normalizeProcess) : [];
}

export async function fetchProcessDetail(processId) {
  const detail = await orchestratorRequest(`/processes/${encodeURIComponent(processId)}`);
  return normalizeProcess(detail);
}

export async function fetchProcessLogs(processId) {
  return orchestratorTextRequest(`/processes/${encodeURIComponent(processId)}/logs`);
}

export async function pauseProcess(processId) {
  const detail = await orchestratorRequest(`/processes/${encodeURIComponent(processId)}/pause`, {
    method: "POST",
  });
  return normalizeProcess(detail);
}

export async function resumeProcess(processId) {
  const detail = await orchestratorRequest(`/processes/${encodeURIComponent(processId)}/resume`, {
    method: "POST",
  });
  return normalizeProcess(detail);
}

export async function deleteProcess(processId) {
  return orchestratorRequest(`/processes/${encodeURIComponent(processId)}`, {
    method: "DELETE",
  });
}

export async function killProcessStep(processId, payload) {
  return orchestratorRequest(`/processes/${encodeURIComponent(processId)}/steps/kill`, {
    method: "POST",
    body: JSON.stringify({
      phase_number: payload.phase_index,
      step_name: payload.step,
    }),
  });
}

export async function updateProcessStepConfig(processId, payload) {
  return orchestratorRequest(`/processes/${encodeURIComponent(processId)}/steps/config`, {
    method: "PATCH",
    body: JSON.stringify({
      phase_number: payload.phase_index,
      step_name: payload.step,
      model: payload.model ?? null,
      config: payload.agent ? { executor_label: payload.agent } : {},
    }),
  });
}

export async function addProcessPhase(processId, payload) {
  return orchestratorRequest(`/processes/${encodeURIComponent(processId)}/phases`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteProcessPhase(processId, phaseIndex) {
  return orchestratorRequest(`/processes/${encodeURIComponent(processId)}/phases/${phaseIndex}`, {
    method: "DELETE",
  });
}

export async function runProcessStep(processId, payload) {
  return orchestratorRequest(`/processes/${encodeURIComponent(processId)}/steps/run`, {
    method: "POST",
    body: JSON.stringify({
      phase_number: payload.phase_index,
      step_name: payload.step,
    }),
  });
}

export async function deleteProcessStep(processId, payload) {
  return orchestratorRequest(`/processes/${encodeURIComponent(processId)}/steps`, {
    method: "DELETE",
    body: JSON.stringify({
      phase_number: payload.phase_index,
      step_name: payload.step,
    }),
  });
}

export async function moveProcessStep(processId, payload) {
  return orchestratorRequest(`/processes/${encodeURIComponent(processId)}/steps/move`, {
    method: "POST",
    body: JSON.stringify({
      from_phase_number: payload.from_phase_index,
      to_phase_number: payload.to_phase_index,
      step_name: payload.step,
    }),
  });
}

export async function addProcessStep(processId, payload) {
  return orchestratorRequest(`/processes/${encodeURIComponent(processId)}/steps`, {
    method: "POST",
    body: JSON.stringify({
      phase_number: payload.phase_index,
      step_name: payload.skill,
      executor_label: payload.agent || "",
      model: payload.model || "",
      config: payload.agent ? { executor_label: payload.agent } : {},
    }),
  });
}

export async function fetchTmuxSession(sessionName) {
  const response = await fetch(`${TMUXER_API_BASE}/sessions/${encodeURIComponent(sessionName)}`, {
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

export async function sendTmuxSessionInput(sessionName, text, { enter = true } = {}) {
  const response = await fetch(`${TMUXER_API_BASE}/sessions/${encodeURIComponent(sessionName)}/input`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, enter }),
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

export async function transcribeAudio(blob, { filename = "recording.webm", language = "" } = {}) {
  const body = new FormData();
  body.append("file", blob, filename);
  if (language) {
    body.append("language", language);
  }
  const response = await fetch(`${STT_API_BASE}/transcribe`, {
    method: "POST",
    body,
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

export async function fetchSkillDefaults() {
  return request("/skill-defaults");
}

export async function upsertSkillDefault(skillName, payload) {
  return request(`/skill-defaults/${encodeURIComponent(skillName)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchPendingMessages() {
  return orchestratorRequest("/messaging/pending");
}

export async function respondToMessage(messageId, response) {
  return orchestratorRequest(`/messaging/${encodeURIComponent(messageId)}/respond`, {
    method: "POST",
    body: JSON.stringify({ response }),
  });
}

export async function triggerPanicStop() {
  return request("/panic-stop", {
    method: "POST",
  });
}

export async function triggerProcessStop(processId) {
  return request(`/panic-stop/${encodeURIComponent(processId)}`, {
    method: "POST",
  });
}

export async function fetchNotes(entityType, entityId) {
  return request(`/notes?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`);
}

export async function createNote(payload) {
  return request("/notes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchNote(noteId) {
  return request(`/notes/${encodeURIComponent(noteId)}`);
}

export async function updateNote(noteId, payload) {
  return request(`/notes/${encodeURIComponent(noteId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteNote(noteId) {
  return request(`/notes/${encodeURIComponent(noteId)}`, {
    method: "DELETE",
  });
}

export async function fetchAttachments(entityType, entityId) {
  return request(`/attachments?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`);
}

export async function uploadAttachment({ entityType, entityId, createdByRole, createdByInstanceKey, file }) {
  const body = new FormData();
  body.append("entity_type", entityType);
  body.append("entity_id", entityId);
  body.append("created_by_role", createdByRole);
  body.append("created_by_instance_key", createdByInstanceKey);
  body.append("file", file);

  const response = await fetch(`${API_BASE}/attachments`, {
    method: "POST",
    body,
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

export async function fetchAttachment(attachmentId) {
  return request(`/attachments/${encodeURIComponent(attachmentId)}`);
}

export async function deleteAttachment(attachmentId) {
  return request(`/attachments/${encodeURIComponent(attachmentId)}`, {
    method: "DELETE",
  });
}

export function attachmentContentUrl(attachmentId, download = false) {
  const query = download ? "?download=true" : "";
  return `${API_BASE}/attachments/${encodeURIComponent(attachmentId)}/content${query}`;
}

export async function createGitIdentity(payload) {
  return request(`/git-identities`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
