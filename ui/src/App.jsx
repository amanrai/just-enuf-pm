import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-python";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-yaml";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { io } from "socket.io-client";
import "xterm/css/xterm.css";
import { SiAnthropic, SiGoogle, SiOpenai } from "react-icons/si";
import AgentsConfigScreen from "./components/AgentsConfigScreen";
import HookScriptsConfigScreen from "./components/HookScriptsConfigScreen";
import OrchestratorConfigScreen from "./components/OrchestratorConfigScreen";
import ProjectFlowView from "./components/ProjectFlowView";
import SecretsConfigScreen from "./components/SecretsConfigScreen";
import SkillsConfigScreen from "./components/SkillsConfigScreen";
import {
  Bot,
  BriefcaseBusiness,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Ellipsis,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  FlaskConical,
  FolderKanban,
  GitBranch,
  GripVertical,
  House,
  KeyRound,
  Skull,
  Layers3,
  MessageSquareMore,
  Network,
  Pencil,
  Pause,
  Play,
  Plus,
  Reply,
  Save,
  Settings,
  SlidersHorizontal,
  Trash2,
  Workflow,
} from "lucide-react";
import {
  createProject,
  createComment,
  deleteProject,
  deleteTask,
  createProcess,
  createSubproject,
  createTask,
  createNote,
  deleteAttachment,
  deleteNote,
  fetchAttachment,
  fetchAgents,
  fetchAgentModels,
  fetchAttachments,
  fetchNote,
  fetchNotes,
  fetchProcessDetail,
  fetchProcessLogs,
  fetchProcesses,
  fetchSkillDefaults,
  fetchSkillDetail,
  fetchSkillFile,
  fetchSkills,
  createSkill,
  fetchTmuxSession,
  sendTmuxSessionInput,
  transcribeAudio,
  fetchWorkflowDetail,
  fetchHookDetail,
  fetchWorkflows,
  fetchHooks,
  fetchPendingMessages,
  pauseProcess,
  resumeProcess,
  deleteProcess,
  killProcessStep,
  runProcessStep,
  updateProcessStepConfig,
  addProcessPhase,
  deleteProcessPhase,
  deleteProcessStep,
  moveProcessStep,
  addProcessStep,
  fetchProject,
  fetchProjectComments,
  fetchProjectProperties,
  fetchProjectRepoLink,
  fetchTaskProperties,
  getNamesOfSecretsByType,
  createProjectProperty,
  createTaskProperty,
  updateProjectProperty,
  updateTaskProperty,
  deleteTaskProperty,
  saveProjectRepoLink,
  fetchProjects,
  fetchProjectSubprojects,
  fetchProjectTasks,
  fetchTask,
  fetchTaskComments,
  fetchTaskTypes,
  createWorkflow,
  createHook,
  deleteWorkflow,
  deleteHook,
  respondToMessage,
  triggerPanicStop,
  triggerProcessStop,
  attachmentContentUrl,
  uploadAttachment,
  updateProject,
  updateSkillFile,
  updateAgentModel,
  updateNote,
  updateTask,
  upsertSkillDefault,
  updateHook,
  updateWorkflow,
} from "./api";
import { STATUS_ORDER } from "./constants";

const NAV_ITEMS = [
  { id: "command-center", label: "Scryer Home", icon: House },
  { id: "projects", label: "Projects", icon: FolderKanban },
];
const RESTORABLE_VIEWS = new Set([
  ...NAV_ITEMS.map((item) => item.id),
  "skills-config",
  "agents-config",
  "orchestrator-config",
  "hooks-config",
  "secrets-config",
]);
const ACTIVE_VIEW_STORAGE_KEY = "pmsystem-active-view";
const PROJECTS_PANE_STORAGE_KEY = "pmsystem-projects-pane";
const SELECTED_PROJECT_STORAGE_KEY = "pmsystem-selected-project-id";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "pmsystem-sidebar-collapsed";
const TERMINAL_PTT_KEY_STORAGE_KEY = "pmsystem-terminal-ptt-key";
const TERMINAL_PTT_HOLD_MS = 500;
const TERMINAL_PTT_OPTIONS = [
  { code: "PageDown", label: "Page Down" },
  { code: "ShiftRight", label: "Right Shift" },
];
const TMUXER_BASE = import.meta.env.VITE_TMUXER_BASE_URL || "http://localhost:5678";
const GIT_IDENTITY_SECRET_TYPE = "git_identity";
const ENVIRONMENT_VARIABLE_SECRET_TYPE = "environment_variable";
const PROJECT_IDENTITIES_PROPERTY_KEY = "project_identities";
const PROJECT_ENVIRONMENT_VARIABLES_PROPERTY_KEY = "project_environment_variables";
const TERMINAL_LINEAR_DARK = {
  background: "#2b303b",
  foreground: "#d7dce5",
  cursor: "#7c8cff",
  cursorAccent: "#2b303b",
  selectionBackground: "rgba(124,140,255,0.18)",
  black: "#232833",
  brightBlack: "#5d6677",
  red: "#ff8f8f",
  brightRed: "#ffb0b0",
  green: "#7bd88f",
  brightGreen: "#99e2a7",
  yellow: "#f2c879",
  brightYellow: "#f6d79b",
  blue: "#7c8cff",
  brightBlue: "#9aa7ff",
  magenta: "#c792ea",
  brightMagenta: "#d8b4fe",
  cyan: "#7fdbca",
  brightCyan: "#a8e6dc",
  white: "#b8c0cc",
  brightWhite: "#d7dce5",
};

function tmuxCols(cols) {
  // User requested a visual correction after eyeballing the terminal fit results.
  return Math.max(20, cols - 2);
}

function tmuxRows(rows) {
  // User requested a visual correction after eyeballing the terminal fit results.
  return Math.max(8, rows - 2);
}

function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isFeatureTaskType(taskType) {
  if (!taskType) return false;
  return taskType.key === "feature" || taskType.name === "Feature";
}

function slugifyProjectName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function formatProjectPath(project, projects) {
  if (!project) return "No project selected";
  const byId = new Map(projects.map((item) => [item.id, item]));
  const parts = [project.name];
  let current = project;
  while (current.parent_project_id) {
    current = byId.get(current.parent_project_id);
    if (!current) break;
    parts.unshift(current.name);
  }
  return parts.join(" / ");
}

function formatSubprojectCreationPath(project, projects) {
  if (!project) return "New Subproject";
  return `${formatProjectPath(project, projects)} > New Subproject`;
}

function firstDescriptionLine(text) {
  if (!text) return "";
  return text.split("\n").map((line) => line.trim()).find(Boolean) || "";
}

function fileNameFromPath(path) {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

function fileExtension(path) {
  const fileName = fileNameFromPath(path);
  const match = fileName.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function markdownToHtml(source) {
  const lines = (source || "").split("\n");
  const html = [];
  let inList = false;
  let inCode = false;
  let codeLines = [];

  function closeList() {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  }

  function closeCode() {
    if (inCode) {
      html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      inCode = false;
      codeLines = [];
    }
  }

  for (const line of lines) {
    if (line.startsWith("```")) {
      closeList();
      if (inCode) {
        closeCode();
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
      continue;
    }
    const listItem = line.match(/^\s*[-*]\s+(.*)$/);
    if (listItem) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${escapeHtml(listItem[1])}</li>`);
      continue;
    }
    closeList();
    html.push(`<p>${escapeHtml(line)}</p>`);
  }

  closeList();
  closeCode();
  return html.join("");
}

function isImageAttachment(attachment) {
  return attachment?.content_type?.startsWith("image/");
}

function isPdfAttachment(attachment) {
  return attachment?.content_type === "application/pdf" || attachment?.file_name?.toLowerCase().endsWith(".pdf");
}

function isTextAttachment(attachment) {
  const contentType = attachment?.content_type || "";
  const ext = fileExtension(attachment?.file_name || "");
  return contentType.startsWith("text/")
    || ["json", "md", "markdown", "py", "js", "ts", "tsx", "jsx", "css", "html", "sh", "yaml", "yml", "toml", "txt"].includes(ext);
}

function useTheme() {
  const [theme, setTheme] = useState(() => {
    const stored = window.localStorage.getItem("pmsystem-theme");
    if (stored === "light" || stored === "dark") {
      return stored;
    }

    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    return prefersLight ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("pmsystem-theme", theme);
  }, [theme]);

  return {
    theme,
    toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
  };
}

function useWorkspaceData() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(() => {
    return window.localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY);
  });
  const [tasks, setTasks] = useState([]);
  const [subprojects, setSubprojects] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadProjects() {
      try {
        setLoading(true);
        const result = await fetchProjects();
        if (!active) return;
        setProjects(result);
        setError("");
      } catch (err) {
        if (!active) return;
        setError(err.message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadProjects();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      window.localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, selectedProjectId);
      return;
    }
    window.localStorage.removeItem(SELECTED_PROJECT_STORAGE_KEY);
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) return;
    if (projects.some((project) => project.id === selectedProjectId)) return;
    setSelectedProjectId(null);
  }, [projects, selectedProjectId]);

  useEffect(() => {
    let active = true;

    async function loadProjectContext() {
      if (!selectedProjectId) {
        setTasks([]);
        setSubprojects([]);
        setProperties([]);
        return;
      }

      try {
        const [taskData, subprojectData, propertyData] = await Promise.all([
          fetchProjectTasks(selectedProjectId),
          fetchProjectSubprojects(selectedProjectId),
          fetchProjectProperties(selectedProjectId),
        ]);

        if (!active) return;
        setTasks(taskData);
        setSubprojects(subprojectData);
        setProperties(propertyData);
      } catch (err) {
        if (!active) return;
        setError(err.message);
      }
    }

    loadProjectContext();

    return () => {
      active = false;
    };
  }, [selectedProjectId]);

  return {
    projects,
    setProjects,
    selectedProjectId,
    setSelectedProjectId,
    tasks,
    setTasks,
    subprojects,
    setSubprojects,
    properties,
    setProperties,
    loading,
    error,
  };
}

function Sidebar({ activeView, onChangeView, collapsed, onToggleCollapsed, homeActivityCount }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand-row">
        <div className="sidebar__brand">
          <div className="brand-mark" aria-hidden="true">
            <Workflow size={14} strokeWidth={2.1} />
          </div>
          <div className="sidebar__brand-copy">
            <div className="brand-title">Scryer</div>
          </div>
        </div>
        <div className="sidebar__controls">
          <button
            className="icon-button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? "›" : "‹"}
          </button>
        </div>
      </div>

      <nav className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-item${item.id === activeView ? " nav-item--active" : ""}`}
            onClick={() => onChangeView(item.id)}
          >
            <span className="nav-item__icon" aria-hidden="true">
              <item.icon size={14} strokeWidth={2.1} />
            </span>
            <span className="nav-item__label">{item.label}</span>
            {item.id === "command-center" && homeActivityCount > 0 ? (
              <span className="nav-item__badge" aria-label={`${homeActivityCount} new home update${homeActivityCount === 1 ? "" : "s"}`}>
                {homeActivityCount}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="sidebar__footer">
        <button
          className={`sidebar-footer-button${activeView === "skills-config" ? " sidebar-footer-button--active" : ""}`}
          type="button"
          onClick={() => onChangeView("skills-config")}
        >
          <span className="sidebar-footer-button__text">Skills Config</span>
          <span className="sidebar-footer-button__icon" aria-hidden="true">
            <Layers3 size={12} strokeWidth={2.1} />
          </span>
        </button>
        <button
          className={`sidebar-footer-button${activeView === "agents-config" ? " sidebar-footer-button--active" : ""}`}
          type="button"
          onClick={() => onChangeView("agents-config")}
        >
          <span className="sidebar-footer-button__text">Agents Config</span>
          <span className="sidebar-footer-button__icon" aria-hidden="true">
            <Bot size={12} strokeWidth={2.1} />
          </span>
        </button>
        <button
          className={`sidebar-footer-button${activeView === "orchestrator-config" ? " sidebar-footer-button--active" : ""}`}
          type="button"
          onClick={() => onChangeView("orchestrator-config")}
        >
          <span className="sidebar-footer-button__text">Orchestrator Config</span>
          <span className="sidebar-footer-button__icon" aria-hidden="true">
            <Network size={12} strokeWidth={2.1} />
          </span>
        </button>
        <button
          className={`sidebar-footer-button${activeView === "hooks-config" ? " sidebar-footer-button--active" : ""}`}
          type="button"
          onClick={() => onChangeView("hooks-config")}
        >
          <span className="sidebar-footer-button__text">Manage Hooks</span>
          <span className="sidebar-footer-button__icon" aria-hidden="true">
            <FileCode2 size={12} strokeWidth={2.1} />
          </span>
        </button>
        <button
          className={`sidebar-footer-button${activeView === "secrets-config" ? " sidebar-footer-button--active" : ""}`}
          type="button"
          onClick={() => onChangeView("secrets-config")}
        >
          <span className="sidebar-footer-button__text">Scryer Settings</span>
          <span className="sidebar-footer-button__icon" aria-hidden="true">
            <SlidersHorizontal size={12} strokeWidth={2.1} />
          </span>
        </button>
      </div>
    </aside>
  );
}

function ShellHeader({
  activeView,
  projectsPane,
  project,
  projects,
  onPrimaryAction,
  onBackToProjects,
}) {
  const isProjectsView = activeView === "projects";
  const isProjectFlow = isProjectsView && projectsPane === "flow";

  return (
    <header className="shell-header">
      <div className="shell-header__intro">
        <div>
          <div className="shell-header__title-row">
            <h1>
              {activeView === "command-center"
                ? "Scryer Home"
                : activeView === "skills-config"
                  ? "Skills Config"
                  : activeView === "agents-config"
                    ? "Agents Config"
                  : activeView === "orchestrator-config"
                    ? "Orchestrator Config"
                  : activeView === "hooks-config"
                    ? "Manage Hooks"
                  : activeView === "secrets-config"
                    ? "Scryer Settings"
                  : projectsPane === "flow" && project
                    ? project.name
                    : "Projects"}
            </h1>
            {isProjectFlow ? (
              <button type="button" className="back-button" onClick={onBackToProjects} aria-label="Back to projects">
                <span className="back-button__arrow">‹</span>
              </button>
            ) : null}
          </div>
          <p className="hero-copy">
            {activeView === "skills-config"
              ? "Define skill bundles, prompts, and execution defaults."
              : activeView === "agents-config"
                ? "Enable or disable models for each agent."
              : activeView === "orchestrator-config"
                ? "Compose workflow phases and the skills each phase should run."
              : activeView === "hooks-config"
                ? "Create and edit reusable Python hook scripts."
              : activeView === "secrets-config"
                ? "Configure appearance, identities, and environment variables."
              : activeView !== "command-center" && projectsPane === "flow" && project
                ? firstDescriptionLine(project.description_md)
                : ""}
          </p>
        </div>
      </div>
      <div className="shell-header__actions">
        {isProjectsView && projectsPane !== "flow" ? (
          <button type="button" className="primary-button" onClick={isProjectsView ? onPrimaryAction : undefined}>
            {isProjectsView ? "New project" : "New task"}
          </button>
        ) : null}
      </div>
    </header>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <article className="stat-card">
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__hint">{hint}</div>
    </article>
  );
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeDuration(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  let remainingMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  const days = Math.floor(remainingMinutes / (60 * 24));
  remainingMinutes -= days * 60 * 24;
  const hours = Math.floor(remainingMinutes / 60);
  remainingMinutes -= hours * 60;
  const minutes = remainingMinutes;

  const parts = [];
  if (days) parts.push(`${days} d`);
  if (hours) parts.push(`${hours} h`);
  if (minutes || !parts.length) parts.push(`${minutes} min`);
  return parts.join(", ");
}

function formatSessionAttachTime() {
  return new Date().toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function findCurrentStep(processDetailOrSummary) {
  for (const phase of processDetailOrSummary?.phases || []) {
    for (const step of phase.steps || []) {
      if (step.status === "running" || step.status === "rfi") {
        return step;
      }
    }
  }
  return null;
}

function processActivityLabel(processDetailOrSummary) {
  const displayStatus = processDisplayStatus(processDetailOrSummary);
  if (displayStatus === "paused") {
    return "";
  }
  if (displayStatus === "waiting") {
    const idleDuration = formatRelativeDuration(processDetailOrSummary?.updated_at);
    return idleDuration ? `idle ${idleDuration}` : "idle";
  }
  if (displayStatus === "running") {
    const currentStep = findCurrentStep(processDetailOrSummary);
    const runningDuration = formatRelativeDuration(currentStep?.started_at || processDetailOrSummary?.updated_at);
    if (runningDuration === "0 min") {
      return "just started";
    }
    return runningDuration ? `started ${runningDuration} ago` : "running";
  }
  return formatDateTime(processDetailOrSummary?.updated_at);
}

function resolveStepSession(step) {
  const detail = step?.detail || {};
  const tmuxSessions = Array.isArray(step?.tmux_sessions) ? step.tmux_sessions.filter(Boolean) : [];
  const sessionName = (
    detail.session_id
    || detail.tmux_session
    || detail.session
    || detail.tmuxSession
    || detail.sessionName
    || step?.tmux_session
    || tmuxSessions[tmuxSessions.length - 1]
    || ""
  );
  return sessionName.startsWith("orch-") ? "" : sessionName;
}

function resolveProcessSession(processDetailOrSummary) {
  const currentSession = processDetailOrSummary?.current_session_name;
  if (currentSession) return currentSession;
  const phases = Array.isArray(processDetailOrSummary?.phases) ? processDetailOrSummary.phases : [];
  const liveStep = phases
    .flatMap((phase) => phase?.steps || [])
    .find((step) => ["running", "dispatched", "waiting", "rfi"].includes(normalizeProcessDisplayStatus(step?.status)));
  return resolveStepSession(liveStep) || "";
}

function processStatusTone(status) {
  if (status === "running") return "blue";
  if (status === "completed") return "green";
  if (status === "failed") return "amber";
  if (status === "waiting") return "amber";
  if (status === "paused") return "neutral";
  return "neutral";
}

function processStatusLabel(status) {
  if (!status) return "Unknown";
  return status.replaceAll("_", " ");
}

function normalizeProcessDisplayStatus(status) {
  if (status === "rfi") return "waiting";
  if (status === "done") return "completed";
  if (status === "dispatched") return "running";
  return status;
}

function phaseDisplayStatus(phase) {
  if ((phase?.steps || []).some((step) => step.status === "rfi")) {
    return "waiting";
  }
  return normalizeProcessDisplayStatus(phase?.status);
}

function processDisplayStatus(processDetailOrSummary) {
  if ((processDetailOrSummary?.phases || []).some((phase) => (phase.steps || []).some((step) => step.status === "rfi"))) {
    return "waiting";
  }
  return normalizeProcessDisplayStatus(processDetailOrSummary?.status);
}

function processPhaseIsUnstarted(phase) {
  if (!phase || normalizeProcessDisplayStatus(phase.status) !== "pending") {
    return false;
  }
  return (phase.steps || []).every(
    (step) => normalizeProcessDisplayStatus(step.status) === "pending"
      && !step.started_at
      && !step.completed_at
      && !resolveStepSession(step),
  );
}

function TerminalSessionDialog({ sessionName, title, onClose }) {
  const terminalRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const socketRef = useRef(null);
  const terminalInstanceRef = useRef(null);
  const pttKeyRef = useRef("PageDown");
  const pttStateRef = useRef("idle");
  const holdTimerRef = useRef(null);
  const heldKeyRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const [status, setStatus] = useState("Connecting");
  const [error, setError] = useState("");
  const [pttError, setPttError] = useState("");
  const [pttState, setPttState] = useState("idle");
  const [pttKeyCode, setPttKeyCode] = useState(() => {
    if (typeof window === "undefined") return "PageDown";
    return window.localStorage.getItem(TERMINAL_PTT_KEY_STORAGE_KEY) || "PageDown";
  });

  const pttKeyLabel = TERMINAL_PTT_OPTIONS.find((item) => item.code === pttKeyCode)?.label || pttKeyCode;
  const pttStatusLabel = pttState === "arming"
    ? `Hold ${pttKeyLabel}...`
    : pttState === "recording"
      ? "Recording..."
      : pttState === "transcribing"
        ? "Transcribing..."
        : `Hold ${pttKeyLabel} 0.5s to talk`;

  useEffect(() => {
    pttKeyRef.current = pttKeyCode;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TERMINAL_PTT_KEY_STORAGE_KEY, pttKeyCode);
    }
  }, [pttKeyCode]);

  useEffect(() => {
    pttStateRef.current = pttState;
  }, [pttState]);

  useEffect(() => {
    let active = true;
    let fitAddon = null;

    async function copySelectionToClipboard() {
      const terminal = terminalInstanceRef.current;
      if (!terminal) return false;
      const selection = terminal.getSelection();
      if (!selection) return false;
      try {
        await navigator.clipboard.writeText(selection);
        return true;
      } catch {
        return false;
      }
    }

    async function pasteClipboardToTerminal() {
      const terminal = terminalInstanceRef.current;
      const socket = socketRef.current;
      if (!terminal || !socket) return false;
      try {
        const text = await navigator.clipboard.readText();
        if (!text) return false;
        socket.emit("input", text);
        return true;
      } catch {
        return false;
      }
    }

    function clearHoldTimer() {
      if (holdTimerRef.current) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    }

    function stopMediaStream() {
      const stream = mediaStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    }

    async function startRecording() {
      if (!active || pttStateRef.current !== "arming" || !heldKeyRef.current) {
        setPttState("idle");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setPttError("Audio recording is not supported in this browser.");
        setPttState("idle");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        mediaStreamRef.current = stream;
        recordingChunksRef.current = [];
        const preferredMimeTypes = [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/ogg;codecs=opus",
        ];
        const mimeType = preferredMimeTypes.find((item) => typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(item));
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size) {
            recordingChunksRef.current.push(event.data);
          }
        };
        recorder.onerror = () => {
          setPttError("Recording failed.");
          setPttState("idle");
          stopMediaStream();
        };
        recorder.onstop = async () => {
          stopMediaStream();
          mediaRecorderRef.current = null;
          const chunks = recordingChunksRef.current;
          recordingChunksRef.current = [];
          if (!chunks.length) {
            setPttState("idle");
            return;
          }
          setPttState("transcribing");
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
            const extension = (recorder.mimeType || "audio/webm").includes("ogg") ? "ogg" : "webm";
            const result = await transcribeAudio(blob, { filename: `recording.${extension}` });
            const transcript = (result?.text || "").trim();
            if (transcript) {
              await sendTmuxSessionInput(sessionName, transcript, { enter: false });
              await sendTmuxSessionInput(sessionName, "", { enter: true });
            }
            if (!transcript) {
              setPttError("No speech detected.");
            }
          } catch (transcriptionError) {
            setPttError(transcriptionError.message || "Transcription failed.");
          } finally {
            setPttState("idle");
            terminalInstanceRef.current?.focus();
          }
        };
        setPttError("");
        setPttState("recording");
        recorder.start();
      } catch (recordingError) {
        setPttError(recordingError.message || "Microphone access denied.");
        setPttState("idle");
        stopMediaStream();
      }
    }

    function beginArming() {
      if (!socketRef.current || pttStateRef.current !== "idle") return;
      heldKeyRef.current = true;
      setPttError("");
      setPttState("arming");
      clearHoldTimer();
      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        void startRecording();
      }, TERMINAL_PTT_HOLD_MS);
    }

    function cancelArming() {
      heldKeyRef.current = false;
      clearHoldTimer();
      if (pttStateRef.current === "arming") {
        setPttState("idle");
      }
    }

    function stopRecording() {
      heldKeyRef.current = false;
      clearHoldTimer();
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      } else if (pttStateRef.current !== "transcribing") {
        setPttState("idle");
      }
    }

    function handleWindowKeyDown(event) {
      if (pttStateRef.current === "recording") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.code !== pttKeyRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat && pttStateRef.current === "idle") {
        beginArming();
      }
    }

    function handleWindowKeyUp(event) {
      if (pttStateRef.current === "recording") {
        event.preventDefault();
        event.stopPropagation();
      }
      if (event.code !== pttKeyRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      if (pttStateRef.current === "arming") {
        cancelArming();
      } else if (pttStateRef.current === "recording") {
        stopRecording();
      }
    }

    function attachTerminal() {
      if (!terminalRef.current) return;

      const terminal = new Terminal({
        theme: TERMINAL_LINEAR_DARK,
        fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", "Menlo", monospace',
        fontSize: 13,
        lineHeight: 1.4,
        fontWeight: "400",
        fontWeightBold: "700",
        cursorBlink: true,
        cursorStyle: "block",
        cursorInactiveStyle: "outline",
        allowTransparency: true,
        allowProposedApi: true,
        drawBoldTextInBrightColors: true,
        minimumContrastRatio: 1,
        rightClickSelectsWord: true,
        scrollback: 5000,
        convertEol: false,
      });
      terminalInstanceRef.current = terminal;
      fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(terminalRef.current);
      fitAddon.fit();
      terminal.focus();
      terminal.attachCustomKeyEventHandler((event) => {
        const isMac = /Mac|iPhone|iPad/.test(window.navigator.platform);
        if (pttStateRef.current === "recording") {
          return false;
        }
        if (event.code === pttKeyRef.current) {
          return false;
        }
        const copyCombo =
          event.type === "keydown"
          && ((isMac && event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "c")
            || (!isMac && event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "c"));
        const pasteCombo =
          event.type === "keydown"
          && ((isMac && event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "v")
            || (!isMac && event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "v"));

        if (copyCombo) {
          void copySelectionToClipboard();
          return false;
        }
        if (pasteCombo) {
          void pasteClipboardToTerminal();
          return false;
        }
        return true;
      });

      const socket = io(TMUXER_BASE, {
        transports: ["websocket"],
      });
      socketRef.current = socket;

      terminal.onData((data) => {
        socket.emit("input", data);
      });

      socket.on("connect", () => {
        setStatus("Attaching");
        socket.emit("attach", {
          session: sessionName,
          cols: tmuxCols(terminal.cols),
          rows: tmuxRows(terminal.rows),
        });
      });

      socket.on("attached", () => {
        if (!active) return;
        setStatus("Live");
        fitAddon.fit();
        terminal.focus();
        socket.emit("resize", {
          cols: tmuxCols(terminal.cols),
          rows: tmuxRows(terminal.rows),
        });
      });

      socket.on("output", (data) => {
        if (!active) return;
        terminal.write(data);
      });

      socket.on("session_not_found", ({ session }) => {
        if (!active) return;
        setError(`Tmux session "${session}" was not found.`);
        setStatus("Unavailable");
      });

      socket.on("disconnect", (reason) => {
        if (!active || reason === "io client disconnect") return;
        setStatus("Disconnected");
      });

      socket.on("connect_error", (connectError) => {
        if (!active) return;
        setError(connectError.message || "Unable to connect to tmuxer.");
        setStatus("Error");
      });

      resizeObserverRef.current = new ResizeObserver(() => {
        if (!socket || !terminal || !fitAddon) return;
        fitAddon.fit();
        socket.emit("resize", {
          cols: tmuxCols(terminal.cols),
          rows: tmuxRows(terminal.rows),
        });
      });
      resizeObserverRef.current.observe(terminalRef.current);
    }

    window.addEventListener("keydown", handleWindowKeyDown, true);
    window.addEventListener("keyup", handleWindowKeyUp, true);
    setStatus("Connecting");
    setError("");
    attachTerminal();

    return () => {
      active = false;
      window.removeEventListener("keydown", handleWindowKeyDown, true);
      window.removeEventListener("keyup", handleWindowKeyUp, true);
      clearHoldTimer();
      heldKeyRef.current = false;
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      stopMediaStream();
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      if (socketRef.current) {
        socketRef.current.emit("detach");
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      terminalInstanceRef.current?.dispose();
      terminalInstanceRef.current = null;
    };
  }, [sessionName]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card modal-card--terminal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terminal-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel__header terminal-dialog__header">
          <div className="panel__header-row">
            <div>
              <div className="panel__title terminal-dialog__title" id="terminal-dialog-title">{title}</div>
              <div className={`terminal-dialog__ptt-status terminal-dialog__ptt-status--${pttState}`}>
                {pttStatusLabel}
              </div>
            </div>
            <div className="terminal-dialog__header-actions">
              <label className="terminal-dialog__ptt-control">
                <span>Talk key</span>
                <select value={pttKeyCode} onChange={(event) => setPttKeyCode(event.target.value)} disabled={pttState === "recording" || pttState === "transcribing"}>
                  {TERMINAL_PTT_OPTIONS.map((item) => (
                    <option key={item.code} value={item.code}>{item.label}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="terminal-dialog__close" onClick={onClose} aria-label="Close terminal">
                <X size={16} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
        <div className="terminal-dialog__body">
          {error ? <div className="empty-copy empty-copy--inset">{error}</div> : null}
          {pttError ? <div className="empty-copy empty-copy--inset">{pttError}</div> : null}
          <div className="terminal-dialog__surface">
            <div ref={terminalRef} className="terminal-dialog__terminal" />
          </div>
        </div>
      </section>
    </div>
  );
}

function ProcessStepConfigDialog({
  open,
  title = "Reconfigure Step",
  stepLabel,
  showSkill = false,
  skill = "",
  skills = [],
  agent,
  model,
  agents,
  models,
  loading,
  saving,
  error,
  onChangeSkill,
  onChangeAgent,
  onChangeModel,
  onClose,
  onSave,
  saveLabel = "Save",
}) {
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const skillOptions = useMemo(() => {
    const query = (skill || "").trim().toLowerCase();
    const sorted = [...skills].sort((a, b) => a.name.localeCompare(b.name));
    if (!query) {
      return sorted;
    }
    return sorted.filter((item) => item.name.toLowerCase().includes(query));
  }, [skill, skills]);

  useEffect(() => {
    if (!open) {
      setSkillMenuOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card process-step-config-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="process-step-config-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel__header">
          <div className="panel__header-row">
            <div>
              <div className="panel__title" id="process-step-config-title">{title}</div>
              <div className="panel__subtitle">{stepLabel}</div>
            </div>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close reconfigure dialog">
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
        <div className="process-step-config-dialog__body">
          {showSkill ? (
            <label className="field field--skill-picker">
              <span className="field__label">Skill</span>
              <input
                className="field__input"
                type="text"
                value={skill}
                onChange={(event) => {
                  onChangeSkill?.(event.target.value);
                  setSkillMenuOpen(true);
                }}
                onFocus={() => setSkillMenuOpen(true)}
                onBlur={() => window.setTimeout(() => setSkillMenuOpen(false), 120)}
                placeholder="Search skill by name"
                autoComplete="off"
                disabled={loading || saving}
              />
              {skillMenuOpen && skillOptions.length ? (
                <div className="field__suggestions" role="listbox" aria-label="Skill suggestions">
                  {skillOptions.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      className={`field__suggestion${item.name === skill ? " field__suggestion--selected" : ""}`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        onChangeSkill?.(item.name);
                        setSkillMenuOpen(false);
                      }}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
          ) : null}
          <label className="field">
            <span className="field__label">Agent</span>
            <select className="field__input" value={agent} onChange={(event) => onChangeAgent(event.target.value)} disabled={loading || saving}>
              <option value="">Select agent</option>
              {agents.map((item) => (
                <option key={item.id} value={item.key}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Model</span>
            <select className="field__input" value={model} onChange={(event) => onChangeModel(event.target.value)} disabled={loading || saving || !agent}>
              <option value="">Select model</option>
              {models.map((item) => (
                <option key={item.id} value={item.model_id}>{item.label || item.model_id}</option>
              ))}
            </select>
          </label>
          {error ? <div className="banner banner--error">{error}</div> : null}
        </div>
        <div className="process-step-config-dialog__footer">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="primary-button" onClick={onSave} disabled={loading || saving || !agent || (showSkill && !skill)}>
            {saving ? "Saving..." : saveLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function CommandCenter({ projects, pendingMessageCount, onOpenMessagesDialog, onOpenProcessProject, onPanicStopComplete, onJoinSession }) {
  const [processes, setProcesses] = useState([]);
  const [processDetailsById, setProcessDetailsById] = useState({});
  const [processesLoading, setProcessesLoading] = useState(true);
  const [processesError, setProcessesError] = useState("");
  const [panicStopping, setPanicStopping] = useState(false);
  const [stoppingProcessIds, setStoppingProcessIds] = useState({});
  const [selectedProcessId, setSelectedProcessId] = useState("");
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [processDetailLoading, setProcessDetailLoading] = useState(false);
  const [processDetailError, setProcessDetailError] = useState("");
  const [sessionAvailability, setSessionAvailability] = useState({});
  const [terminalDialog, setTerminalDialog] = useState({ open: false, sessionName: "", title: "" });
  const autoAttachedMessageIdsRef = useRef(new Set());
  const [expandedProjects, setExpandedProjects] = useState({});
  const [processListMode, setProcessListMode] = useState("active");
  const [actingProcessIds, setActingProcessIds] = useState({});
  const [draggingProcessStep, setDraggingProcessStep] = useState(null);
  const [dragTargetPhaseKey, setDragTargetPhaseKey] = useState("");
  const [stepConfigDialog, setStepConfigDialog] = useState({
    open: false,
    mode: "config",
    processId: "",
    phaseIndex: 0,
    stepName: "",
    stepLabel: "",
    skill: "",
    agent: "",
    model: "",
  });
  const [stepConfigAgents, setStepConfigAgents] = useState([]);
  const [stepConfigModels, setStepConfigModels] = useState([]);
  const [stepConfigSkills, setStepConfigSkills] = useState([]);
  const [stepConfigLoading, setStepConfigLoading] = useState(false);
  const [stepConfigSaving, setStepConfigSaving] = useState(false);
  const [stepConfigError, setStepConfigError] = useState("");
  const [watchDialog, setWatchDialog] = useState({ open: false, processId: "", title: "", content: "", loading: false, error: "" });

  async function loadActiveProcessesSnapshot() {
    const summaries = await fetchProcesses();
    const activeSummaries = summaries.filter((process) =>
      ["pending", "running", "paused"].includes(process.status),
    );
    const uniqueTaskIds = [...new Set(summaries.map((process) => process.task_id).filter(Boolean))];
    const taskPairs = await Promise.all(
      uniqueTaskIds.map(async (taskId) => {
        try {
          const task = await fetchTask(taskId);
          return [taskId, task];
        } catch {
          return [taskId, null];
        }
      }),
    );
    const taskMap = new Map(taskPairs);
    const projectMap = new Map((projects || []).map((project) => [project.id, project]));
    const data = summaries.map((process) => {
      const task = taskMap.get(process.task_id);
      const project = task?.project_id ? projectMap.get(task.project_id) : null;
      return {
        ...process,
        project_id: task?.project_id || "",
        project_name: project?.name || "Untitled Project",
      };
    });
    const detailPairs = await Promise.all(
      activeSummaries.map(async (process) => {
        try {
          const detail = await fetchProcessDetail(process.id);
          return [process.id, detail];
        } catch {
          return [process.id, null];
        }
      }),
    );
    return {
      data,
      detailMap: Object.fromEntries(detailPairs.filter(([, detail]) => Boolean(detail))),
    };
  }

  function applyProcessSnapshot(data, detailMap) {
    setProcesses(data);
    setProcessDetailsById(detailMap);
    setSelectedProcessId((current) => (current && data.some((process) => process.id === current) ? current : ""));
    setExpandedProjects((current) => {
      const next = { ...current };
      let changed = false;
      for (const process of data) {
        const key = process.project_id || `unmapped:${process.id}`;
        if (!(key in next)) {
          next[key] = true;
          changed = true;
        }
      }
      return changed ? next : current;
    });
    setSelectedProcess((current) => {
      if (current?.id && detailMap[current.id]) {
        return detailMap[current.id];
      }
      return current?.id && !data.some((process) => process.id === current.id) ? null : current;
    });
  }

  async function refreshActiveProcesses() {
    const { data, detailMap } = await loadActiveProcessesSnapshot();
    applyProcessSnapshot(data, detailMap);
    setProcessesError("");
  }

  useEffect(() => {
    let active = true;

    async function loadProcesses(isInitial = false) {
      try {
        if (isInitial) {
          setProcessesLoading(true);
        }
        const { data, detailMap } = await loadActiveProcessesSnapshot();
        if (!active) return;
        applyProcessSnapshot(data, detailMap);
        setProcessesError("");
      } catch (error) {
        if (!active) return;
        setProcessesError(error.message || "Unable to load processes.");
      } finally {
        if (active && isInitial) {
          setProcessesLoading(false);
        }
      }
    }

    loadProcesses(true);
    const intervalId = window.setInterval(() => loadProcesses(false), 500);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [projects]);

  useEffect(() => {
    let active = true;

    async function loadProcessDetail() {
      if (!selectedProcessId) {
        setSelectedProcess(null);
        setProcessDetailError("");
        setProcessDetailLoading(false);
        return;
      }

      try {
        setProcessDetailLoading(true);
        const detail = await fetchProcessDetail(selectedProcessId);
        if (!active) return;
        setSelectedProcess(detail);
        setProcessDetailError("");
      } catch (error) {
        if (!active) return;
        setSelectedProcess(null);
        if (error?.status === 404) {
          setSelectedProcessId("");
          setProcessDetailError("");
        } else {
          setProcessDetailError(error.message || "Unable to load process detail.");
        }
      } finally {
        if (active) {
          setProcessDetailLoading(false);
        }
      }
    }

    loadProcessDetail();
    const intervalId = selectedProcessId ? window.setInterval(loadProcessDetail, 500) : null;

    return () => {
      active = false;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [selectedProcessId]);

  useEffect(() => {
    let active = true;

    async function refreshSessionAvailability() {
      const completedSessions = [
        ...new Set(
          (selectedProcess?.phases || [])
            .flatMap((phase) => phase.steps || [])
            .filter((step) => normalizeProcessDisplayStatus(step.status) === "completed")
            .map((step) => resolveStepSession(step))
            .filter(Boolean),
        ),
      ];

      if (!completedSessions.length) {
        if (active) {
          setSessionAvailability({});
        }
        return;
      }

      const pairs = await Promise.all(
        completedSessions.map(async (sessionName) => {
          try {
            await fetchTmuxSession(sessionName);
            return [sessionName, true];
          } catch {
            return [sessionName, false];
          }
        }),
      );

      if (!active) return;
      setSessionAvailability(Object.fromEntries(pairs));
    }

    refreshSessionAvailability();
    const intervalId = selectedProcess ? window.setInterval(refreshSessionAvailability, 10000) : null;

    return () => {
      active = false;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [selectedProcess]);

  useEffect(() => {
    let active = true;

    async function loadStepConfigOptions() {
      if (!stepConfigDialog.open) return;
      setStepConfigLoading(true);
      try {
        const [agents, skills] = await Promise.all([
          fetchAgents(),
          fetchSkills(),
        ]);
        if (!active) return;
        const enabledAgents = agents.filter((item) => item.is_enabled);
        const selectedPhase = selectedProcess?.phases?.[stepConfigDialog.phaseIndex];
        const existingSkillNames = new Set((selectedPhase?.steps || []).map((step) => step.skill));
        const availableSkills = stepConfigDialog.mode === "add"
          ? (skills || []).filter((skill) => !existingSkillNames.has(skill.name))
          : (skills || []);
        setStepConfigAgents(enabledAgents);
        setStepConfigSkills(availableSkills);
        if (stepConfigDialog.agent) {
          const selectedAgent = enabledAgents.find((item) => item.key === stepConfigDialog.agent);
          if (selectedAgent) {
            const models = await fetchAgentModels(selectedAgent.id);
            if (!active) return;
            setStepConfigModels(models.filter((item) => item.is_enabled === 1));
          } else {
            setStepConfigModels([]);
          }
        } else {
          setStepConfigModels([]);
        }
      } catch (error) {
        if (!active) return;
        setStepConfigError(error.message || "Unable to load step configuration options.");
      } finally {
        if (active) {
          setStepConfigLoading(false);
        }
      }
    }

    loadStepConfigOptions();
    return () => {
      active = false;
    };
  }, [stepConfigDialog.open, stepConfigDialog.mode, stepConfigDialog.phaseIndex]);

  useEffect(() => {
    let active = true;

    async function loadStepModels() {
      if (!stepConfigDialog.open || !stepConfigDialog.agent) {
        setStepConfigModels([]);
        return;
      }
      setStepConfigLoading(true);
      try {
        const selectedAgent = stepConfigAgents.find((item) => item.key === stepConfigDialog.agent);
        if (!selectedAgent) {
          if (!active) return;
          setStepConfigModels([]);
          return;
        }
        const models = (await fetchAgentModels(selectedAgent.id)).filter((item) => item.is_enabled === 1);
        if (!active) return;
        setStepConfigModels(models);
        if (stepConfigDialog.model && !models.some((item) => item.model_id === stepConfigDialog.model)) {
          setStepConfigDialog((current) => ({ ...current, model: "" }));
        }
      } catch (error) {
        if (!active) return;
        setStepConfigError(error.message || "Unable to load models for the selected agent.");
      } finally {
        if (active) {
          setStepConfigLoading(false);
        }
      }
    }

    loadStepModels();
    return () => {
      active = false;
    };
  }, [stepConfigDialog.open, stepConfigDialog.agent, stepConfigAgents]);

  const filteredProcesses = useMemo(() => {
    return processes.filter((process) => {
      const status = normalizeProcessDisplayStatus(process.status);
      if (processListMode === "archived") {
        return status === "completed" || status === "failed";
      }
      return status !== "completed" && status !== "failed";
    });
  }, [processes, processListMode]);

  const processListCounts = useMemo(() => {
    const active = processes.filter((process) => {
      const status = normalizeProcessDisplayStatus(process.status);
      return status !== "completed" && status !== "failed";
    }).length;
    const archived = processes.length - active;
    return { active, archived };
  }, [processes]);

  const groupedProjects = useMemo(() => {
    const grouped = new Map();
    for (const process of filteredProcesses) {
      const key = process.project_id || `unmapped:${process.id}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.processes.push(process);
        continue;
      }
      grouped.set(key, {
        key,
        projectId: process.project_id || "",
        projectName: process.project_name || "Untitled Project",
        processes: [process],
      });
    }

    return [...grouped.values()]
      .map((group) => ({
        ...group,
        processes: [...group.processes].sort(
          (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
        ),
      }))
      .sort((left, right) => {
        const leftTime = new Date(left.processes[0]?.updated_at || 0).getTime();
        const rightTime = new Date(right.processes[0]?.updated_at || 0).getTime();
        return rightTime - leftTime;
      });
  }, [filteredProcesses]);

  function toggleProjectGroup(groupKey) {
    setExpandedProjects((current) => ({
      ...current,
      [groupKey]: current[groupKey] === false,
    }));
  }

  function processHasLiveExecution(processSummary, processDetail) {
    const phases = processDetail?.phases || [];
    if (phases.length) {
      return phases.some((phase) =>
        (phase.steps || []).some(
          (step) => step.tmux_session && ["dispatched", "running", "rfi"].includes(step.status),
        ),
      );
    }
    const status = processDisplayStatus(processSummary);
    return status === "running" || status === "waiting";
  }

  async function handlePanicStop() {
    if (panicStopping) return;
    setPanicStopping(true);
    try {
      await triggerPanicStop();
      await refreshActiveProcesses();
      setSelectedProcessId("");
      setSelectedProcess(null);
      await onPanicStopComplete?.();
    } catch (error) {
      setProcessesError(error.message || "Unable to stop running processes.");
    } finally {
      setPanicStopping(false);
    }
  }

  async function handleStopProcess(processId) {
    if (!processId || stoppingProcessIds[processId]) return;
    setStoppingProcessIds((current) => ({ ...current, [processId]: true }));
    try {
      await triggerProcessStop(processId);
      await refreshActiveProcesses();
      setSelectedProcessId((current) => (current === processId ? "" : current));
      setSelectedProcess((current) => (current?.id === processId ? null : current));
      await onPanicStopComplete?.();
    } catch (error) {
      setProcessesError(error.message || "Unable to stop the process.");
    } finally {
      setStoppingProcessIds((current) => {
        const next = { ...current };
        delete next[processId];
        return next;
      });
    }
  }

  async function handleDeleteProcess(processId) {
    if (!processId || actingProcessIds[processId]) return;
    setActingProcessIds((current) => ({ ...current, [processId]: true }));
    try {
      await deleteProcess(processId);
      await refreshActiveProcesses();
      setSelectedProcessId((current) => (current === processId ? "" : current));
      setSelectedProcess((current) => (current?.id === processId ? null : current));
      await onPanicStopComplete?.();
    } catch (error) {
      setProcessesError(error.message || "Unable to delete the process.");
    } finally {
      setActingProcessIds((current) => {
        const next = { ...current };
        delete next[processId];
        return next;
      });
    }
  }

  async function handleProcessStateChange(processId, action) {
    if (!processId || actingProcessIds[processId]) return;
    setActingProcessIds((current) => ({ ...current, [processId]: true }));
    try {
      if (action === "pause") {
        await pauseProcess(processId);
      } else {
        await resumeProcess(processId);
      }
      await refreshActiveProcesses();
    } catch (error) {
      setProcessesError(error.message || `Unable to ${action} the process.`);
    } finally {
      setActingProcessIds((current) => {
        const next = { ...current };
        delete next[processId];
        return next;
      });
    }
  }

  function openStepConfigDialog(processId, phaseIndex, step) {
    setStepConfigDialog({
      open: true,
      mode: "config",
      processId,
      phaseIndex,
      stepName: step.skill,
      stepLabel: `Phase ${phaseIndex + 1} / ${step.skill}`,
      skill: step.skill,
      agent: step.agent || "",
      model: step.model || "",
    });
    setStepConfigError("");
  }

  function openAddStepDialog(processId, phaseIndex) {
    setStepConfigDialog({
      open: true,
      mode: "add",
      processId,
      phaseIndex,
      stepName: "",
      stepLabel: `Phase ${phaseIndex + 1}`,
      skill: "",
      agent: "",
      model: "",
    });
    setStepConfigError("");
  }

  function closeStepConfigDialog() {
    if (stepConfigSaving) return;
    setStepConfigDialog({ open: false, mode: "config", processId: "", phaseIndex: 0, stepName: "", stepLabel: "", skill: "", agent: "", model: "" });
    setStepConfigError("");
    setStepConfigModels([]);
    setStepConfigSkills([]);
  }

  async function handleKillStep(processId, phaseIndex, stepName) {
    if (!processId || actingProcessIds[processId]) return;
    setActingProcessIds((current) => ({ ...current, [processId]: true }));
    try {
      await killProcessStep(processId, { phase_index: phaseIndex, step: stepName });
      await refreshActiveProcesses();
    } catch (error) {
      setProcessesError(error.message || "Unable to kill the step.");
    } finally {
      setActingProcessIds((current) => {
        const next = { ...current };
        delete next[processId];
        return next;
      });
    }
  }

  async function handleRunStep(processId, phaseIndex, stepName) {
    if (!processId || actingProcessIds[processId]) return;
    setActingProcessIds((current) => ({ ...current, [processId]: true }));
    try {
      await runProcessStep(processId, { phase_index: phaseIndex, step: stepName });
      await refreshActiveProcesses();
    } catch (error) {
      setProcessesError(error.message || "Unable to run the step.");
    } finally {
      setActingProcessIds((current) => {
        const next = { ...current };
        delete next[processId];
        return next;
      });
    }
  }

  async function handleDeleteStep(processId, phaseIndex, stepName) {
    if (!processId || actingProcessIds[processId]) return;
    setActingProcessIds((current) => ({ ...current, [processId]: true }));
    try {
      await deleteProcessStep(processId, { phase_index: phaseIndex, step: stepName });
      await refreshActiveProcesses();
    } catch (error) {
      setProcessesError(error.message || "Unable to delete the step.");
    } finally {
      setActingProcessIds((current) => {
        const next = { ...current };
        delete next[processId];
        return next;
      });
    }
  }

  async function handleMoveStep(processId, fromPhaseIndex, stepName, toPhaseIndex) {
    if (!processId || actingProcessIds[processId] || fromPhaseIndex === toPhaseIndex) return;
    setActingProcessIds((current) => ({ ...current, [processId]: true }));
    setDragTargetPhaseKey("");
    try {
      await moveProcessStep(processId, {
        from_phase_index: fromPhaseIndex,
        to_phase_index: toPhaseIndex,
        step: stepName,
      });
      await refreshActiveProcesses();
    } catch (error) {
      setProcessesError(error.message || "Unable to move the step.");
    } finally {
      setDraggingProcessStep(null);
      setActingProcessIds((current) => {
        const next = { ...current };
        delete next[processId];
        return next;
      });
    }
  }

  async function handleAddPhase(processId, insertIndex) {
    if (!processId || actingProcessIds[processId]) return;
    setActingProcessIds((current) => ({ ...current, [processId]: true }));
    try {
      await addProcessPhase(processId, { insert_index: insertIndex });
      await refreshActiveProcesses();
    } catch (error) {
      setProcessesError(error.message || "Unable to add the phase.");
    } finally {
      setActingProcessIds((current) => {
        const next = { ...current };
        delete next[processId];
        return next;
      });
    }
  }

  async function handleDeletePhase(processId, phaseIndex) {
    if (!processId || actingProcessIds[processId]) return;
    setActingProcessIds((current) => ({ ...current, [processId]: true }));
    try {
      await deleteProcessPhase(processId, phaseIndex);
      await refreshActiveProcesses();
    } catch (error) {
      setProcessesError(error.message || "Unable to delete the phase.");
    } finally {
      setActingProcessIds((current) => {
        const next = { ...current };
        delete next[processId];
        return next;
      });
    }
  }

  async function handleSaveStepConfig() {
    if (!stepConfigDialog.processId || !stepConfigDialog.agent || stepConfigSaving) return;
    if (stepConfigDialog.mode === "add" && !stepConfigDialog.skill) return;
    setStepConfigSaving(true);
    setStepConfigError("");
    try {
      if (stepConfigDialog.mode === "add") {
        await addProcessStep(stepConfigDialog.processId, {
          phase_index: stepConfigDialog.phaseIndex,
          skill: stepConfigDialog.skill,
          agent: stepConfigDialog.agent,
          model: stepConfigDialog.model || "",
        });
      } else {
        await updateProcessStepConfig(stepConfigDialog.processId, {
          phase_index: stepConfigDialog.phaseIndex,
          step: stepConfigDialog.stepName,
          agent: stepConfigDialog.agent,
          model: stepConfigDialog.model || "",
        });
      }
      await refreshActiveProcesses();
      closeStepConfigDialog();
    } catch (error) {
      setStepConfigError(
        error.message || (stepConfigDialog.mode === "add" ? "Unable to add the step." : "Unable to update the step configuration."),
      );
    } finally {
      setStepConfigSaving(false);
    }
  }

  async function openStepSession(stepSession, title) {
    if (!stepSession) return;
    try {
      await fetchTmuxSession(stepSession);
      setSessionAvailability((current) => ({ ...current, [stepSession]: true }));
      if (onJoinSession) {
        await onJoinSession(stepSession, title);
      } else {
        setTerminalDialog({
          open: true,
          sessionName: stepSession,
          title,
        });
      }
    } catch {
      setSessionAvailability((current) => ({ ...current, [stepSession]: false }));
    }
  }

  async function openWatchDialog(processId, title) {
    setWatchDialog({
      open: true,
      processId,
      title,
      content: "",
      loading: true,
      error: "",
    });

    try {
      const content = await fetchProcessLogs(processId);
      setWatchDialog((current) => (
        current.processId !== processId
          ? current
          : { ...current, content, loading: false, error: "" }
      ));
    } catch (error) {
      setWatchDialog((current) => (
        current.processId !== processId
          ? current
          : { ...current, loading: false, error: error.message || "Unable to load logs." }
      ));
    }
  }

  function closeWatchDialog() {
    setWatchDialog({ open: false, processId: "", title: "", content: "", loading: false, error: "" });
  }

  useEffect(() => {
    if (!watchDialog.open || !watchDialog.processId) return undefined;
    let cancelled = false;

    async function pollProcessLogs() {
      try {
        const content = await fetchProcessLogs(watchDialog.processId);
        if (!cancelled) {
          setWatchDialog((current) => (
            current.open && current.processId === watchDialog.processId
              ? { ...current, content, loading: false, error: "" }
              : current
          ));
        }
      } catch (error) {
        if (!cancelled) {
          setWatchDialog((current) => (
            current.open && current.processId === watchDialog.processId
              ? { ...current, loading: false, error: error.message || "Unable to load logs." }
              : current
          ));
        }
      }
    }

    const intervalId = window.setInterval(pollProcessLogs, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [watchDialog.open, watchDialog.processId]);

  return (
    <section className="command-center-stack">
      <article className="panel process-panel process-panel--stack">
        <div className="panel__header panel__header--stacked process-panel__summary">
          <div className="panel__subtitle process-panel__summary-copy">
            {processListMode === "archived" ? (
              processListCounts.archived
                ? "Archived runs stay here until you delete them."
                : "No archived runs yet."
            ) : processes.length ? (
              <>
                You have{" "}
                <button
                  type="button"
                  className="process-panel__notifications-link"
                  onClick={onOpenMessagesDialog}
                >
                  {pendingMessageCount} pending notification{pendingMessageCount === 1 ? "" : "s"}
                </button>
                . Feeling paranoid?{" "}
                <button
                  type="button"
                  className="process-panel__panic-link"
                  onClick={handlePanicStop}
                  disabled={panicStopping}
                  title="This will stop everything executing. Be careful."
                  aria-label="This will stop everything executing. Be careful."
                >
                  {panicStopping ? "Stopping everything..." : "Hit the big red button"}
                </button>
                .
              </>
            ) : (
              "No active runs right now."
            )}
          </div>
          <div className="process-panel__mode-switch" role="tablist" aria-label="Process list mode">
            <button
              type="button"
              className={`process-panel__mode${processListMode === "active" ? " process-panel__mode--active" : ""}`}
              onClick={() => setProcessListMode("active")}
            >
              <span>Active</span>
              <span className="process-panel__count">{processListCounts.active}</span>
            </button>
            <button
              type="button"
              className={`process-panel__mode${processListMode === "archived" ? " process-panel__mode--active" : ""}`}
              onClick={() => setProcessListMode("archived")}
            >
              <span>Archived</span>
              <span className="process-panel__count">{processListCounts.archived}</span>
            </button>
          </div>
        </div>
        {processesLoading ? (
          <div className="empty-copy empty-copy--inset">Loading process runs...</div>
        ) : processesError ? (
          <div className="empty-copy empty-copy--inset">{processesError}</div>
        ) : groupedProjects.length ? (
          <div className="project-process-accordion">
            {groupedProjects.map((group) => {
              const isExpanded = expandedProjects[group.key] !== false;
              return (
                <section key={group.key} className="project-process-group">
                  <button
                    type="button"
                    className="project-process-group__header"
                    onClick={() => toggleProjectGroup(group.key)}
                    aria-expanded={isExpanded}
                  >
                    <span className="project-process-group__header-main">
                      <span className="project-process-group__title">{group.projectName}</span>
                      <span className="project-process-group__meta">
                        {group.processes.length} {processListMode === "archived" ? `archived run${group.processes.length === 1 ? "" : "s"}` : `active`}
                      </span>
                    </span>
                    <span className="project-process-group__header-side">
                      <span className="project-process-group__updated">
                        Updated {formatDateTime(group.processes[0]?.updated_at)}
                      </span>
                      {isExpanded ? <ChevronDown size={16} strokeWidth={2} /> : <ChevronRight size={16} strokeWidth={2} />}
                    </span>
                  </button>

                  {isExpanded ? (
                    <div className="project-process-group__body">
                      {group.processes.map((process) => (
                        <div key={process.id} className="project-process-entry">
                          {(() => {
                            const rowDetail = selectedProcessId === process.id && selectedProcess
                              ? selectedProcess
                              : processDetailsById[process.id];
                            const rowStatus = processDisplayStatus(rowDetail || process);
                            const rowActivity = processActivityLabel(rowDetail || process);
                            const canPauseResume = rowStatus === "paused" || rowStatus === "running" || rowStatus === "waiting";
                            const canKill = processHasLiveExecution(process, rowDetail);
                            return (
                          <div
                            className={`process-row${selectedProcessId === process.id ? " process-row--focused" : ""}`}
                          >
                            <button
                              type="button"
                              className="process-row__main"
                              onClick={() => setSelectedProcessId((current) => (current === process.id ? "" : process.id))}
                            >
                              <span className="process-row__leading">
                                <span className="process-row__avatar">
                                  P{Math.min((process.current_phase || 0) + 1, process.total_phases || 1)}
                                </span>
                                <span className="process-row__body">
                                  <span className="process-row__title">{process.task_title}</span>
                                  <span className="process-row__meta">
                                    <span>{process.workflow_name}</span>
                                    <span>•</span>
                                    <span>{process.id}</span>
                                  </span>
                                </span>
                              </span>
                              <span className="process-row__trailing">
                                <span className={`status-pill tone-${processStatusTone(rowStatus)}`}>
                                  {processStatusLabel(rowStatus)}
                                </span>
                                <span className="process-row__timestamp">{rowActivity}</span>
                              </span>
                            </button>
                            {canPauseResume ? (
                            <button
                              type="button"
                              className="process-row__control-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleProcessStateChange(process.id, rowStatus === "paused" ? "resume" : "pause");
                              }}
                              title={rowStatus === "paused" ? "Resume execution." : "Pause execution."}
                              aria-label={rowStatus === "paused" ? "Resume execution." : "Pause execution."}
                              disabled={Boolean(actingProcessIds[process.id])}
                            >
                              {rowStatus === "paused" ? <Play size={14} strokeWidth={2} /> : <Pause size={14} strokeWidth={2} />}
                            </button>
                            ) : null}
                            {canKill ? (
                            <button
                              type="button"
                              className="process-row__kill-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleStopProcess(process.id);
                              }}
                              title="Kill live execution."
                              aria-label="Kill live execution."
                              disabled={Boolean(stoppingProcessIds[process.id])}
                            >
                              <Skull size={14} strokeWidth={2} />
                            </button>
                            ) : null}
                            <button
                              type="button"
                              className="process-row__watch-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openWatchDialog(process.id, process.task_title || process.workflow_name || process.id);
                              }}
                              title="Watch workflow logs."
                              aria-label="Watch workflow logs."
                            >
                              <Eye size={14} strokeWidth={2} />
                              <span>Watch</span>
                            </button>
                            <button
                              type="button"
                              className="process-row__delete-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDeleteProcess(process.id);
                              }}
                              title="Delete this run."
                              aria-label="Delete this run."
                              disabled={Boolean(actingProcessIds[process.id])}
                            >
                              <Trash2 size={14} strokeWidth={2} />
                            </button>
                          </div>
                            );
                          })()}

                          {selectedProcessId === process.id ? (
                            processDetailLoading && !selectedProcess ? (
                              <div className="empty-copy empty-copy--inset">Loading process detail...</div>
                            ) : processDetailError ? (
                              <div className="empty-copy empty-copy--inset">{processDetailError}</div>
                            ) : selectedProcess ? (
                                <div className="process-detail process-detail--inline">
                                {resolveProcessSession(selectedProcess) ? (
                                  <div className="process-detail__actions">
                                    <button
                                      type="button"
                                      className="secondary-button"
                                      onClick={() => openStepSession(
                                        resolveProcessSession(selectedProcess),
                                        [
                                          selectedProcess.project_name || "Untitled Project",
                                          selectedProcess.task_title,
                                          selectedProcess.workflow_name || "Workflow Session",
                                        ].join(" / "),
                                      )}
                                    >
                                      Attach to Workflow Session
                                    </button>
                                  </div>
                                ) : null}
                                <div className="process-flow">
                                  <div className="process-flow__track">
                                    {selectedProcess && (selectedProcess.phases || []).length ? (
                                      (() => {
                                        const phases = selectedProcess.phases || [];
                                        const canInsertAtStart = processPhaseIsUnstarted(phases[0]);
                                        return (
                                          <>
                                            <div className={`process-flow__connector process-flow__connector--head${canInsertAtStart ? " process-flow__connector--insertable" : ""}`}>
                                              <div className="process-flow__connector-line" />
                                              {canInsertAtStart ? (
                                                <button
                                                  type="button"
                                                  className="process-flow__connector-dot process-flow__connector-dot--button"
                                                  onClick={() => handleAddPhase(selectedProcess.id, 0)}
                                                  disabled={Boolean(actingProcessIds[selectedProcess.id])}
                                                  aria-label="Add a phase before phase 1"
                                                />
                                              ) : (
                                                <div className="process-flow__connector-dot" aria-hidden="true" />
                                              )}
                                            </div>
                                            {phases.map((phase, phaseIndex) => {
                                      const displayPhaseStatus = phaseDisplayStatus(phase);
                                      const nextPhase = phases[phaseIndex + 1];
                                      const canInsertAfterPhase = Boolean(nextPhase) && processPhaseIsUnstarted(nextPhase);
                                      const canAddStepToPhase = processPhaseIsUnstarted(phase);
                                      const canDeletePhase = phases.length > 1 && processPhaseIsUnstarted(phase);
                                      const canRunPhase = selectedProcess.status === "paused" && phase.index === (selectedProcess.current_phase || 0);
                                      const canAcceptMovedStep = processPhaseIsUnstarted(phase);
                                      const phaseDropKey = `${selectedProcess.id}:${phase.index}`;
                                      const isDropTargetPhase = dragTargetPhaseKey === phaseDropKey;
                                      return (
                                      <div key={phase.index} className="process-flow__segment">
                                        <section
                                          className={`process-flow__phase process-flow__phase--${processStatusTone(displayPhaseStatus)}${isDropTargetPhase ? " process-flow__phase--drop-target" : ""}`}
                                          onDragOver={(event) => {
                                            if (!draggingProcessStep || !canAcceptMovedStep || draggingProcessStep.processId !== selectedProcess.id || draggingProcessStep.fromPhaseIndex === phase.index || Boolean(actingProcessIds[selectedProcess.id])) {
                                              return;
                                            }
                                            event.preventDefault();
                                            event.dataTransfer.dropEffect = "move";
                                            if (dragTargetPhaseKey !== phaseDropKey) {
                                              setDragTargetPhaseKey(phaseDropKey);
                                            }
                                          }}
                                          onDragLeave={(event) => {
                                            if (dragTargetPhaseKey === phaseDropKey && !event.currentTarget.contains(event.relatedTarget)) {
                                              setDragTargetPhaseKey("");
                                            }
                                          }}
                                          onDrop={(event) => {
                                            if (!draggingProcessStep || !canAcceptMovedStep || draggingProcessStep.processId !== selectedProcess.id || draggingProcessStep.fromPhaseIndex === phase.index || Boolean(actingProcessIds[selectedProcess.id])) {
                                              return;
                                            }
                                            event.preventDefault();
                                            const payload = draggingProcessStep;
                                            setDragTargetPhaseKey("");
                                            setDraggingProcessStep(null);
                                            handleMoveStep(selectedProcess.id, payload.fromPhaseIndex, payload.stepName, phase.index);
                                          }}
                                        >
                                          <div className="process-flow__phase-header">
                                            <div className="process-flow__phase-label">Phase {phase.index + 1}</div>
                                            <div className="process-flow__phase-header-actions">
                                              {canRunPhase ? (
                                                <button
                                                  type="button"
                                                  className="process-flow__phase-delete"
                                                  onClick={() => handleProcessStateChange(selectedProcess.id, "resume")}
                                                  disabled={Boolean(actingProcessIds[selectedProcess.id])}
                                                  title="Run from this phase."
                                                  aria-label="Run from this phase."
                                                >
                                                  <Play size={14} strokeWidth={2} />
                                                </button>
                                              ) : null}
                                              {canDeletePhase ? (
                                                <button
                                                  type="button"
                                                  className="process-flow__phase-delete"
                                                  onClick={() => handleDeletePhase(selectedProcess.id, phase.index)}
                                                  disabled={Boolean(actingProcessIds[selectedProcess.id])}
                                                  title="Delete this phase from the current run."
                                                  aria-label="Delete this phase from the current run."
                                                >
                                                  <Trash2 size={14} strokeWidth={2} />
                                                </button>
                                              ) : null}
                                            </div>
                                          </div>
                                          <div className="process-flow__steps">
                                            {(phase.steps || []).length ? (phase.steps || []).map((step) => (
                                              (() => {
                                                const displayStepStatus = normalizeProcessDisplayStatus(step.status);
                                                const stepSession = resolveStepSession(step);
                                                const showSessionButton = stepSession
                                                  && (displayStepStatus !== "completed" || sessionAvailability[stepSession] !== false);
                                                const stepAssignmentLabel = `${step.agent || ""}${step.model ? ` / ${step.model}` : ""}`;
                                                const canKillThisStep = phaseIndex === (selectedProcess.current_phase || 0)
                                                  && stepSession
                                                  && ["dispatched", "running", "waiting"].includes(displayStepStatus);
                                                const canReconfigureThisStep = displayStepStatus === "pending"
                                                  && !step.started_at;
                                                const canDeleteThisStep = displayStepStatus === "pending"
                                                  && !step.started_at;
                                                const canRunThisStep = selectedProcess.status === "paused"
                                                  && phase.index === (selectedProcess.current_phase || 0)
                                                  && displayStepStatus === "pending"
                                                  && !step.started_at;
                                                const canMoveThisStep = displayStepStatus === "pending"
                                                  && !step.started_at
                                                  && processPhaseIsUnstarted(phase);
                                                return (
                                              <div
                                                key={`${phase.index}-${step.skill}`}
                                                className={`process-flow__step process-flow__step--${processStatusTone(displayStepStatus)}${showSessionButton ? " process-flow__step--live" : " process-flow__step--idle"}${canMoveThisStep ? " process-flow__step--draggable" : ""}`}
                                                draggable={canMoveThisStep}
                                                onDragStart={(event) => {
                                                  if (!canMoveThisStep) return;
                                                  event.dataTransfer.effectAllowed = "move";
                                                  setDraggingProcessStep({
                                                    processId: selectedProcess.id,
                                                    fromPhaseIndex: phase.index,
                                                    stepName: step.skill,
                                                  });
                                                }}
                                                onDragEnd={() => {
                                                  setDraggingProcessStep(null);
                                                  setDragTargetPhaseKey("");
                                                }}
                                              >
                                                <div className="process-flow__step-body">
                                                  {canMoveThisStep ? (
                                                    <div className="process-flow__step-drag-handle" aria-hidden="true">
                                                      <GripVertical size={12} strokeWidth={2} />
                                                    </div>
                                                  ) : null}
                                                  {(canReconfigureThisStep || canRunThisStep || canDeleteThisStep) ? (
                                                    <div className="process-flow__step-corner-actions">
                                                      {canReconfigureThisStep ? (
                                                        <button
                                                          type="button"
                                                          className="icon-button process-flow__step-action process-flow__step-action--settings"
                                                          onClick={() => openStepConfigDialog(selectedProcess.id, phase.index, step)}
                                                          title="Reconfigure this step."
                                                          aria-label="Reconfigure this step."
                                                        >
                                                          <Settings size={13} strokeWidth={2} />
                                                        </button>
                                                      ) : null}
                                                      {canRunThisStep ? (
                                                        <button
                                                          type="button"
                                                          className="icon-button process-flow__step-action process-flow__step-action--run"
                                                          onClick={() => handleRunStep(selectedProcess.id, phase.index, step.skill)}
                                                          title="Run this step."
                                                          aria-label="Run this step."
                                                          disabled={Boolean(actingProcessIds[selectedProcess.id])}
                                                        >
                                                          <Play size={13} strokeWidth={2} />
                                                        </button>
                                                      ) : null}
                                                      {canDeleteThisStep ? (
                                                        <button
                                                          type="button"
                                                          className="icon-button process-flow__step-action process-flow__step-action--delete"
                                                          onClick={() => handleDeleteStep(selectedProcess.id, phase.index, step.skill)}
                                                          title="Delete this step from the current run."
                                                          aria-label="Delete this step from the current run."
                                                          disabled={Boolean(actingProcessIds[selectedProcess.id])}
                                                        >
                                                          <Trash2 size={13} strokeWidth={2} />
                                                        </button>
                                                      ) : null}
                                                    </div>
                                                  ) : null}
                                                  <div className="process-flow__step-top">
                                                    <div className="process-flow__step-skill">{step.skill}</div>
                                                    <div className="process-flow__step-actions">
                                                      {canKillThisStep ? (
                                                        <button
                                                          type="button"
                                                          className="icon-button process-flow__step-action process-flow__step-action--danger"
                                                          onClick={() => handleKillStep(selectedProcess.id, phase.index, step.skill)}
                                                          title="Kill this step and pause execution."
                                                          aria-label="Kill this step and pause execution."
                                                          disabled={Boolean(actingProcessIds[selectedProcess.id])}
                                                        >
                                                          <Trash2 size={13} strokeWidth={2} />
                                                        </button>
                                                      ) : null}
                                                      {displayPhaseStatus === "pending" ? null : (
                                                        <div className={`status-pill tone-${processStatusTone(displayStepStatus)}`}>
                                                          {processStatusLabel(displayStepStatus)}
                                                        </div>
                                                      )}
                                                    </div>
                                                  </div>
                                                  <div className="process-flow__step-footer">
                                                    {showSessionButton ? (
                                                      <>
                                                        <button
                                                          type="button"
                                                          className="secondary-button process-flow__session-button"
                                                          onClick={() => openStepSession(
                                                            stepSession,
                                                            [
                                                              selectedProcess.project_name || "Untitled Project",
                                                              selectedProcess.task_title,
                                                              step.skill,
                                                            ].join(" / "),
                                                          )}
                                                        >
                                                          Join Session
                                                        </button>
                                                        <div className="process-flow__step-agent">
                                                          {stepAssignmentLabel}
                                                          {step.started_at ? ` (started ${formatRelativeDuration(step.started_at)} ago)` : ""}
                                                        </div>
                                                      </>
                                                    ) : stepAssignmentLabel ? (
                                                      <div className="process-flow__step-configured">
                                                        {stepAssignmentLabel}
                                                      </div>
                                                    ) : null}
                                                  </div>
                                                </div>
                                              </div>
                                                );
                                              })()
                                            )) : null}
                                          </div>
                                          {canAddStepToPhase ? (
                                            <div className="process-flow__phase-footer">
                                              <button
                                                type="button"
                                                className="process-flow__phase-add-step"
                                                onClick={() => openAddStepDialog(selectedProcess.id, phase.index)}
                                                disabled={Boolean(actingProcessIds[selectedProcess.id])}
                                                title={`Add a step to phase ${phase.index + 1}`}
                                                aria-label={`Add a step to phase ${phase.index + 1}`}
                                              >
                                                <Plus size={14} strokeWidth={2} />
                                              </button>
                                            </div>
                                          ) : null}
                                        </section>
                                        {phaseIndex < phases.length - 1 ? (
                                          <div
                                            className={`process-flow__connector${phaseIndex < (selectedProcess.current_phase || 0) ? " process-flow__connector--completed" : phaseIndex === (selectedProcess.current_phase || 0) ? " process-flow__connector--active" : ""}${canInsertAfterPhase ? " process-flow__connector--insertable" : ""}`}
                                          >
                                            <div className="process-flow__connector-line" />
                                            {canInsertAfterPhase ? (
                                              <button
                                                type="button"
                                                className="process-flow__connector-dot process-flow__connector-dot--button"
                                                onClick={() => handleAddPhase(selectedProcess.id, phaseIndex + 1)}
                                                disabled={Boolean(actingProcessIds[selectedProcess.id])}
                                                aria-label={`Add a phase after phase ${phaseIndex + 1}`}
                                              />
                                            ) : (
                                              <div className="process-flow__connector-dot" aria-hidden="true" />
                                            )}
                                          </div>
                                        ) : null}
                                      </div>
                                      );
                                    })}
                                          </>
                                        );
                                      })()
                                    ) : null}
                                    {selectedProcess && normalizeProcessDisplayStatus(selectedProcess.status) !== "completed" && normalizeProcessDisplayStatus(selectedProcess.status) !== "failed" ? (
                                      <div className="process-flow__connector process-flow__connector--tail process-flow__connector--insertable">
                                        <div className="process-flow__connector-line" />
                                        <button
                                          type="button"
                                          className="process-flow__connector-dot process-flow__connector-dot--button"
                                          onClick={() => handleAddPhase(selectedProcess.id, (selectedProcess.phases || []).length)}
                                          disabled={Boolean(actingProcessIds[selectedProcess.id])}
                                          aria-label="Add a phase at the end"
                                        />
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="empty-copy empty-copy--inset">No process detail available.</div>
                            )
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="empty-copy empty-copy--inset">{processListMode === "archived" ? "No archived runs yet." : "No active runs right now."}</div>
        )}
      </article>
      <ProcessStepConfigDialog
        open={stepConfigDialog.open}
        title={stepConfigDialog.mode === "add" ? "Add Step" : "Reconfigure Step"}
        saveLabel={stepConfigDialog.mode === "add" ? "Add Step" : "Save"}
        stepLabel={stepConfigDialog.stepLabel}
        showSkill={stepConfigDialog.mode === "add"}
        skill={stepConfigDialog.skill}
        skills={stepConfigSkills}
        agent={stepConfigDialog.agent}
        model={stepConfigDialog.model}
        agents={stepConfigAgents}
        models={stepConfigModels}
        loading={stepConfigLoading}
        saving={stepConfigSaving}
        error={stepConfigError}
        onChangeSkill={(value) => setStepConfigDialog((current) => ({ ...current, skill: value }))}
        onChangeAgent={(value) => setStepConfigDialog((current) => ({ ...current, agent: value, model: "" }))}
        onChangeModel={(value) => setStepConfigDialog((current) => ({ ...current, model: value }))}
        onClose={closeStepConfigDialog}
        onSave={handleSaveStepConfig}
      />
      {terminalDialog.open ? (
        <TerminalSessionDialog
          sessionName={terminalDialog.sessionName}
          title={terminalDialog.title}
          onClose={() => setTerminalDialog({ open: false, sessionName: "", title: "" })}
        />
      ) : null}
      {watchDialog.open ? (
        <div className="modal-backdrop" role="presentation" onClick={closeWatchDialog}>
          <div
            className="modal-card modal-card--watch"
            role="dialog"
            aria-modal="true"
            aria-labelledby="watch-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel__header">
              <div>
                <div className="panel__title" id="watch-dialog-title">Watch Logs</div>
                <div className="panel__subtitle">{watchDialog.title || watchDialog.processId}</div>
              </div>
              <button type="button" className="icon-button" onClick={closeWatchDialog} aria-label="Close watch dialog">
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="watch-dialog__body">
              {watchDialog.loading && !watchDialog.content ? <div className="empty-copy">Loading logs...</div> : null}
              {watchDialog.error ? <div className="empty-copy">{watchDialog.error}</div> : null}
              <pre className="watch-dialog__log">{watchDialog.content || ""}</pre>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CommandCenterLegacy({ project, projects, tasks, subprojects, properties }) {
  return (
    <section className="home-pane">
      <p className="home-pane__title">because f_ck your calendar.</p>
    </section>
  );
}

function EntityAssetsDialog({ entityType, entityId, entityLabel, onClose }) {
  const fileInputRef = useRef(null);
  const [notes, setNotes] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [activeItem, setActiveItem] = useState(null);
  const [activeNote, setActiveNote] = useState(null);
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteDraftTitle, setNoteDraftTitle] = useState("");
  const [noteDraftContent, setNoteDraftContent] = useState("");
  const [filePreviewText, setFilePreviewText] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState("");

  async function refreshAssets(preferredItem = null) {
    try {
      setLoading(true);
      const [noteData, attachmentData] = await Promise.all([
        fetchNotes(entityType, entityId),
        fetchAttachments(entityType, entityId),
      ]);
      setNotes(noteData);
      setAttachments(attachmentData);
      const nextActive =
        preferredItem
        || activeItem
        || (noteData[0] ? { kind: "note", id: noteData[0].id } : attachmentData[0] ? { kind: "attachment", id: attachmentData[0].id } : null);
      setActiveItem(nextActive);
      setError("");
    } catch (nextError) {
      setError(nextError.message || "Unable to load notes and files.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  useEffect(() => {
    let active = true;

    async function loadActiveItem() {
      if (!activeItem) {
        setActiveNote(null);
        setFilePreviewText("");
        return;
      }
      try {
        setLoadingPreview(true);
        if (activeItem.kind === "note") {
          const detail = await fetchNote(activeItem.id);
          if (!active) return;
          setActiveNote(detail);
          setNoteDraftTitle(detail.title);
          setNoteDraftContent(detail.content_md);
          setNoteEditing(false);
          setFilePreviewText("");
          return;
        }
        setActiveNote(null);
        setNoteEditing(false);
        const attachment = await fetchAttachment(activeItem.id);
        if (!active) return;
        if (isTextAttachment(attachment)) {
          const response = await fetch(attachmentContentUrl(attachment.id));
          const text = await response.text();
          if (!active) return;
          setFilePreviewText(text);
        } else {
          setFilePreviewText("");
        }
      } catch (nextError) {
        if (!active) return;
        setError(nextError.message || "Unable to load item.");
      } finally {
        if (active) {
          setLoadingPreview(false);
        }
      }
    }

    loadActiveItem();
    return () => { active = false; };
  }, [activeItem]);

  async function handleCreateNote() {
    const note = await createNote({
      entity_type: entityType,
      entity_id: entityId,
      title: "New Note",
      content_md: "",
      created_by_role: "human",
      created_by_instance_key: "web-ui",
    });
    await refreshAssets({ kind: "note", id: note.id });
    setNoteEditing(true);
  }

  async function handleSaveNote() {
    if (!activeNote) return;
    const updated = await updateNote(activeNote.id, {
      title: noteDraftTitle,
      content_md: noteDraftContent,
    });
    setActiveNote((current) => current ? { ...current, ...updated, content_md: noteDraftContent } : current);
    setNoteEditing(false);
    await refreshAssets({ kind: "note", id: activeNote.id });
  }

  async function handleDeleteNote(noteId) {
    await deleteNote(noteId);
    setActiveItem(null);
    setActiveNote(null);
    await refreshAssets();
  }

  async function handleDeleteAttachment(attachmentId) {
    await deleteAttachment(attachmentId);
    setActiveItem(null);
    await refreshAssets();
  }

  async function handleUploadFiles(files) {
    const fileList = Array.from(files || []);
    if (!fileList.length) return;
    for (const file of fileList) {
      await uploadAttachment({
        entityType,
        entityId,
        createdByRole: "human",
        createdByInstanceKey: "web-ui",
        file,
      });
    }
    await refreshAssets();
  }

  const activeAttachment = activeItem?.kind === "attachment"
    ? attachments.find((attachment) => attachment.id === activeItem.id) || null
    : null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card modal-card--assets"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assets-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel__header">
          <div className="panel__header-row">
            <div>
              <div className="panel__title" id="assets-dialog-title">{entityLabel}</div>
              <div className="panel__subtitle">Notes & Files</div>
            </div>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close notes and files">
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
        <div className="assets-dialog">
          <aside className="assets-dialog__sidebar">
            <section className="assets-dialog__section">
              <div className="assets-dialog__section-header">
                <div className="assets-dialog__section-title">Notes</div>
                <button type="button" className="icon-button" onClick={handleCreateNote} aria-label="Create note" title="Create note">
                  <Plus size={14} strokeWidth={2} />
                </button>
              </div>
              <div className="assets-dialog__list">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className={`assets-dialog__item${activeItem?.kind === "note" && activeItem.id === note.id ? " assets-dialog__item--active" : ""}`}
                  >
                    <button
                      type="button"
                      className="assets-dialog__item-main"
                      onClick={() => setActiveItem({ kind: "note", id: note.id })}
                    >
                      <span className="assets-dialog__item-title">{note.title}</span>
                      <span className="assets-dialog__item-meta">{formatDateTime(note.updated_at)}</span>
                    </button>
                    <button
                      type="button"
                      className="icon-button assets-dialog__item-delete"
                      onClick={() => handleDeleteNote(note.id)}
                      aria-label={`Delete ${note.title}`}
                      title="Delete"
                    >
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
            <section className="assets-dialog__section">
              <div className="assets-dialog__section-header">
                <div className="assets-dialog__section-title">Files</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(event) => handleUploadFiles(event.target.files)}
                />
              </div>
              <div
                className="assets-dialog__dropzone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  handleUploadFiles(event.dataTransfer.files);
                }}
              >
                Drag files here
              </div>
              <div className="assets-dialog__list">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className={`assets-dialog__item${activeItem?.kind === "attachment" && activeItem.id === attachment.id ? " assets-dialog__item--active" : ""}`}
                  >
                    <button
                      type="button"
                      className="assets-dialog__item-main"
                      onClick={() => setActiveItem({ kind: "attachment", id: attachment.id })}
                    >
                      <span className="assets-dialog__item-title">{attachment.file_name}</span>
                      <span className="assets-dialog__item-meta">{formatDateTime(attachment.updated_at)}</span>
                    </button>
                    <button
                      type="button"
                      className="icon-button assets-dialog__item-delete"
                      onClick={() => handleDeleteAttachment(attachment.id)}
                      aria-label={`Delete ${attachment.file_name}`}
                      title="Delete"
                    >
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </aside>
          <section className="assets-dialog__viewer">
            {error ? <div className="banner banner--error">{error}</div> : null}
            {loading ? (
              <div className="empty-copy empty-copy--inset">Loading notes and files...</div>
            ) : activeItem?.kind === "note" && activeNote ? (
              <>
                <div className="assets-dialog__viewer-toolbar">
                  <div className="assets-dialog__viewer-heading">
                    {noteEditing ? (
                      <input
                        className="field__input assets-dialog__title-input"
                        value={noteDraftTitle}
                        onChange={(event) => setNoteDraftTitle(event.target.value)}
                        placeholder="Note title"
                      />
                    ) : (
                      <div className="assets-dialog__viewer-title">{activeNote.title}</div>
                    )}
                    <div className="assets-dialog__viewer-meta">
                      Updated {formatDateTime(activeNote.updated_at)}
                    </div>
                  </div>
                  <div className="assets-dialog__viewer-actions">
                    {noteEditing ? (
                      <>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => {
                          setNoteDraftTitle(activeNote.title);
                          setNoteDraftContent(activeNote.content_md || "");
                          setNoteEditing(false);
                        }}
                          aria-label="Cancel note editing"
                          title="Cancel"
                        >
                          <X size={14} strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          className="icon-button icon-button--primary"
                          onClick={handleSaveNote}
                          aria-label="Save note"
                          title="Save"
                        >
                          <Save size={14} strokeWidth={2} />
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => handleDeleteNote(activeNote.id)}
                      aria-label="Delete note"
                      title="Delete"
                    >
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  </div>
                </div>
                {noteEditing ? (
                  <div className="assets-dialog__note-workspace">
                    <div className="assets-dialog__note-pane">
                      <div className="assets-dialog__pane-label">Markdown</div>
                      <div className="assets-dialog__editor-shell">
                        <Editor
                          value={noteDraftContent}
                          onValueChange={setNoteDraftContent}
                          highlight={(code) => Prism.highlight(code || "", Prism.languages.markdown, "markdown")}
                          padding={20}
                          className="assets-dialog__code-editor"
                          textareaClassName="assets-dialog__code-textarea"
                          preClassName="assets-dialog__code-pre"
                          spellCheck={false}
                        />
                      </div>
                    </div>
                    <div className="assets-dialog__note-pane">
                      <div className="assets-dialog__pane-label">Preview</div>
                      <div
                        className="assets-dialog__markdown"
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(noteDraftContent || "") || "<p>Start writing.</p>" }}
                      />
                    </div>
                  </div>
                ) : (
                  <div
                    className="assets-dialog__markdown"
                    onClick={() => setNoteEditing(true)}
                    dangerouslySetInnerHTML={{ __html: markdownToHtml(activeNote.content_md || "") || "<p>Click to start writing.</p>" }}
                  />
                )}
              </>
            ) : activeItem?.kind === "attachment" && activeAttachment ? (
              <>
                <div className="assets-dialog__viewer-toolbar">
                  <div className="assets-dialog__viewer-title">{activeAttachment.file_name}</div>
                  <div className="assets-dialog__viewer-actions">
                    <a
                      className="icon-button assets-dialog__download-link"
                      href={attachmentContentUrl(activeAttachment.id, true)}
                      aria-label={`Download ${activeAttachment.file_name}`}
                      title="Download"
                    >
                      <Download size={14} strokeWidth={2} />
                    </a>
                  </div>
                </div>
                {loadingPreview ? (
                  <div className="empty-copy empty-copy--inset">Loading preview...</div>
                ) : isImageAttachment(activeAttachment) ? (
                  <div className="assets-dialog__media-wrap">
                    <img className="assets-dialog__image" src={attachmentContentUrl(activeAttachment.id)} alt={activeAttachment.file_name} />
                  </div>
                ) : isPdfAttachment(activeAttachment) ? (
                  <iframe className="assets-dialog__pdf" src={attachmentContentUrl(activeAttachment.id)} title={activeAttachment.file_name} />
                ) : isTextAttachment(activeAttachment) ? (
                  <pre className="assets-dialog__text-preview"><code>{filePreviewText}</code></pre>
                ) : (
                  <div className="empty-copy empty-copy--inset">No in-app preview for this file type.</div>
                )}
              </>
            ) : (
              <div className="empty-copy empty-copy--inset">Select a note or file.</div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function parseStringListProperty(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch {
    return String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function stringifyStringListProperty(value) {
  return JSON.stringify(Array.from(new Set((value || []).map((item) => String(item).trim()).filter(Boolean))));
}

function EntityDetailDialog({ entityType, entityId, onClose, onSaved, onDeleteProject, onDeleteTask }) {
  const [entity, setEntity] = useState(null);
  const [comments, setComments] = useState([]);
  const [title, setTitle] = useState("");
  const [titleEditing, setTitleEditing] = useState(false);
  const [description, setDescription] = useState("");
  const [remoteRepo, setRemoteRepo] = useState("");
  const [remoteRepoPropertyId, setRemoteRepoPropertyId] = useState("");
  const [availableProjectIdentities, setAvailableProjectIdentities] = useState([]);
  const [selectedProjectIdentities, setSelectedProjectIdentities] = useState([]);
  const [projectIdentitiesPropertyId, setProjectIdentitiesPropertyId] = useState("");
  const [availableProjectEnvironmentVariables, setAvailableProjectEnvironmentVariables] = useState([]);
  const [selectedProjectEnvironmentVariables, setSelectedProjectEnvironmentVariables] = useState([]);
  const [projectEnvironmentVariablesPropertyId, setProjectEnvironmentVariablesPropertyId] = useState("");
  const [projectRepoLink, setProjectRepoLink] = useState(null);
  const [taskProperties, setTaskProperties] = useState([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingComment, setSavingComment] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadEntity() {
      try {
        setLoading(true);
        const requests = [
          entityType === "project" ? fetchProject(entityId) : fetchTask(entityId),
          entityType === "project" ? fetchProjectComments(entityId) : fetchTaskComments(entityId),
        ];
        if (entityType === "project") {
          requests.push(fetchProjectProperties(entityId));
          requests.push(fetchProjectRepoLink(entityId));
          requests.push(getNamesOfSecretsByType(GIT_IDENTITY_SECRET_TYPE).catch(() => ({ names: [] })));
          requests.push(getNamesOfSecretsByType(ENVIRONMENT_VARIABLE_SECRET_TYPE).catch(() => ({ names: [] })));
        }
        const [
          detail,
          nextComments,
          projectProperties = [],
          repoLink = null,
          identityNamesResponse = { names: [] },
          environmentVariableNamesResponse = { names: [] },
        ] = await Promise.all(requests);
        if (!active) return;
        setEntity(detail);
        setTitle(entityType === "project" ? detail.name : detail.title);
        setTitleEditing(false);
        setDescription(detail.description_md || "");
        if (entityType === "project") {
          const remoteRepoProperty = projectProperties.find((property) => property.key === "remote_repo") || null;
          const identitiesProperty = projectProperties.find((property) => property.key === PROJECT_IDENTITIES_PROPERTY_KEY) || null;
          const environmentVariablesProperty =
            projectProperties.find((property) => property.key === PROJECT_ENVIRONMENT_VARIABLES_PROPERTY_KEY) || null;
          const nextSelectedIdentities = parseStringListProperty(identitiesProperty?.value);
          const nextSelectedEnvironmentVariables = parseStringListProperty(environmentVariablesProperty?.value);
          setRemoteRepo(repoLink?.remote_url || remoteRepoProperty?.value || "");
          setRemoteRepoPropertyId(remoteRepoProperty?.id || "");
          const liveIdentityNames = Array.isArray(identityNamesResponse?.names) ? [...identityNamesResponse.names].sort((left, right) => left.localeCompare(right)) : [];
          const liveEnvironmentVariableNames = Array.isArray(environmentVariableNamesResponse?.names)
            ? [...environmentVariableNamesResponse.names].sort((left, right) => left.localeCompare(right))
            : [];
          setAvailableProjectIdentities(liveIdentityNames);
          setSelectedProjectIdentities(nextSelectedIdentities.filter((name) => liveIdentityNames.includes(name)));
          setProjectIdentitiesPropertyId(identitiesProperty?.id || "");
          setAvailableProjectEnvironmentVariables(liveEnvironmentVariableNames);
          setSelectedProjectEnvironmentVariables(
            nextSelectedEnvironmentVariables.filter((name) => liveEnvironmentVariableNames.includes(name)),
          );
          setProjectEnvironmentVariablesPropertyId(environmentVariablesProperty?.id || "");
          setProjectRepoLink(repoLink || null);
          setTaskProperties([]);
        } else {
          setRemoteRepo("");
          setRemoteRepoPropertyId("");
          setAvailableProjectIdentities([]);
          setSelectedProjectIdentities([]);
          setProjectIdentitiesPropertyId("");
          setAvailableProjectEnvironmentVariables([]);
          setSelectedProjectEnvironmentVariables([]);
          setProjectEnvironmentVariablesPropertyId("");
          setProjectRepoLink(null);
          setTaskProperties(await fetchTaskProperties(entityId).catch(() => []));
        }
        setComments(nextComments);
        setError("");
      } catch (nextError) {
        if (!active) return;
        setError(nextError.message || "Unable to load details.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadEntity();
    return () => { active = false; };
  }, [entityType, entityId]);

  function toggleSelection(value, selectedValues, setter) {
    setter(
      selectedValues.includes(value)
        ? selectedValues.filter((item) => item !== value)
        : [...selectedValues, value].sort((left, right) => left.localeCompare(right)),
    );
  }

  function updateTaskPropertyDraft(index, field, value) {
    setTaskProperties((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )));
  }

  function addTaskPropertyDraft() {
    setTaskProperties((current) => [...current, {
      id: "",
      task_id: entityId,
      key: "",
      value: "",
      value_type: "text",
    }]);
  }

  async function removeTaskPropertyDraft(index) {
    const property = taskProperties[index];
    if (!property) return;
    if (property.id) {
      await deleteTaskProperty(property.id);
    }
    setTaskProperties((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  useEffect(() => {
    if (entityType !== "project") return undefined;
    if (!projectRepoLink || !["queued", "cloning"].includes(projectRepoLink.clone_status)) return undefined;

    let active = true;
    const interval = window.setInterval(async () => {
      try {
        const nextRepoLink = await fetchProjectRepoLink(entityId);
        if (!active) return;
        setProjectRepoLink(nextRepoLink || null);
      } catch {
        // ignore transient poll failures
      }
    }, 1000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [entityType, entityId, projectRepoLink?.id, projectRepoLink?.clone_status]);

  async function handleSave() {
    if (!entity) return;
    setSaving(true);
    setError("");
    try {
      if (entityType === "project") {
        const updated = await updateProject(entityId, {
          name: title.trim(),
          description_md: description.trim() || null,
        });
        const nextRemoteRepo = remoteRepo.trim();
        if (nextRemoteRepo) {
          const savedRepoLink = await saveProjectRepoLink(entityId, { remote_url: nextRemoteRepo });
          const projectProperties = await fetchProjectProperties(entityId);
          const remoteRepoProperty = projectProperties.find((property) => property.key === "remote_repo") || null;
          const identitiesProperty = projectProperties.find((property) => property.key === PROJECT_IDENTITIES_PROPERTY_KEY) || null;
          const environmentVariablesProperty =
            projectProperties.find((property) => property.key === PROJECT_ENVIRONMENT_VARIABLES_PROPERTY_KEY) || null;
          setProjectRepoLink(savedRepoLink);
          setRemoteRepo(savedRepoLink.remote_url || "");
          setRemoteRepoPropertyId(remoteRepoProperty?.id || "");
          setProjectIdentitiesPropertyId(identitiesProperty?.id || "");
          setProjectEnvironmentVariablesPropertyId(environmentVariablesProperty?.id || "");
        } else if (remoteRepoPropertyId) {
          const updatedProperty = await updateProjectProperty(remoteRepoPropertyId, {
            value: "",
            value_type: "text",
          });
          setRemoteRepo(updatedProperty.value || "");
          setRemoteRepoPropertyId(updatedProperty.id);
          setProjectRepoLink(null);
        }
        if (projectIdentitiesPropertyId) {
          const updatedIdentitiesProperty = await updateProjectProperty(projectIdentitiesPropertyId, {
            value: stringifyStringListProperty(selectedProjectIdentities),
            value_type: "json",
          });
          setSelectedProjectIdentities(parseStringListProperty(updatedIdentitiesProperty.value));
          setProjectIdentitiesPropertyId(updatedIdentitiesProperty.id);
        } else if (selectedProjectIdentities.length > 0) {
          const createdIdentitiesProperty = await createProjectProperty({
            project_id: entityId,
            key: PROJECT_IDENTITIES_PROPERTY_KEY,
            value: stringifyStringListProperty(selectedProjectIdentities),
            value_type: "json",
          });
          setSelectedProjectIdentities(parseStringListProperty(createdIdentitiesProperty.value));
          setProjectIdentitiesPropertyId(createdIdentitiesProperty.id);
        }
        if (projectEnvironmentVariablesPropertyId) {
          const updatedEnvironmentVariablesProperty = await updateProjectProperty(projectEnvironmentVariablesPropertyId, {
            value: stringifyStringListProperty(selectedProjectEnvironmentVariables),
            value_type: "json",
          });
          setSelectedProjectEnvironmentVariables(parseStringListProperty(updatedEnvironmentVariablesProperty.value));
          setProjectEnvironmentVariablesPropertyId(updatedEnvironmentVariablesProperty.id);
        } else if (selectedProjectEnvironmentVariables.length > 0) {
          const createdEnvironmentVariablesProperty = await createProjectProperty({
            project_id: entityId,
            key: PROJECT_ENVIRONMENT_VARIABLES_PROPERTY_KEY,
            value: stringifyStringListProperty(selectedProjectEnvironmentVariables),
            value_type: "json",
          });
          setSelectedProjectEnvironmentVariables(parseStringListProperty(createdEnvironmentVariablesProperty.value));
          setProjectEnvironmentVariablesPropertyId(createdEnvironmentVariablesProperty.id);
        }
        setEntity(updated);
        setTitle(updated.name);
        setDescription(updated.description_md || "");
      } else {
        const updated = await updateTask(entityId, {
          title: title.trim(),
          description_md: description.trim() || null,
        });
        const nextTaskProperties = [];
        for (const property of taskProperties) {
          const key = (property.key || "").trim();
          const value = property.value ?? "";
          if (!key) {
            if (property.id) {
              await deleteTaskProperty(property.id);
            }
            continue;
          }
          if (property.id) {
            const saved = await updateTaskProperty(property.id, {
              value,
              value_type: property.value_type || "text",
            });
            nextTaskProperties.push(saved);
          } else {
            const created = await createTaskProperty({
              task_id: entityId,
              key,
              value,
              value_type: property.value_type || "text",
            });
            nextTaskProperties.push(created);
          }
        }
        setEntity(updated);
        setTitle(updated.title);
        setDescription(updated.description_md || "");
        setTaskProperties(nextTaskProperties);
      }
      await onSaved?.();
    } catch (nextError) {
      setError(nextError.message || "Unable to save details.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddComment() {
    if (!commentDraft.trim()) return;
    setSavingComment(true);
    setError("");
    try {
      await createComment({
        author_role: "human",
        author_instance_key: "web-ui",
        body_md: commentDraft.trim(),
        ...(entityType === "project" ? { project_id: entityId } : { task_id: entityId }),
      });
      const nextComments = entityType === "project" ? await fetchProjectComments(entityId) : await fetchTaskComments(entityId);
      setComments(nextComments);
      setCommentDraft("");
      await onSaved?.();
    } catch (nextError) {
      setError(nextError.message || "Unable to add comment.");
    } finally {
      setSavingComment(false);
    }
  }

  const repoStatusText = entityType === "project"
    ? (() => {
        if (!projectRepoLink) return "";
        if (projectRepoLink.clone_status === "ready") return projectRepoLink.relative_repo_path;
        if (projectRepoLink.clone_status === "failed") return projectRepoLink.error_message || "Clone failed";
        const progress = Number.isFinite(projectRepoLink.clone_progress) ? Math.max(projectRepoLink.clone_progress, 0) : 0;
        return `${projectRepoLink.clone_stage || "Cloning"}${progress > 0 ? ` • ${progress}%` : ""}`;
      })()
    : "";

  const orderedComments = [...comments].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card modal-card--entity-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="entity-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel__header">
          <div className="panel__header-row">
            <div>
              {loading ? (
                <div className="panel__title entity-detail__header-title" id="entity-detail-title">
                  {entityType === "project" ? "Project" : "Ticket"}
                </div>
              ) : titleEditing ? (
                <input
                  className="field__input entity-detail__title-input entity-detail__title-input--header"
                  id="entity-detail-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  onBlur={() => setTitleEditing(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      setTitleEditing(false);
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setTitle(entityType === "project" ? entity?.name || "" : entity?.title || "");
                      setTitleEditing(false);
                    }
                  }}
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  className="entity-detail__title-display entity-detail__title-display--header"
                  id="entity-detail-title"
                  onClick={() => setTitleEditing(true)}
                >
                  {title || (entityType === "project" ? "Untitled Project" : "Untitled Ticket")}
                </button>
              )}
            </div>
            <div className="entity-detail__header-actions">
              <button
                type="button"
                className="secondary-button danger-text-button"
                onClick={() => {
                  if (entityType === "project") {
                    onDeleteProject?.(entity);
                  } else {
                    onDeleteTask?.(entity);
                  }
                }}
                disabled={loading || saving || savingComment}
              >
                Delete
              </button>
              <button type="button" className="icon-button" onClick={onClose} aria-label="Close details">
                <X size={16} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>

        <div className="entity-detail">
          {loading ? (
            <div className="empty-copy empty-copy--inset">Loading details...</div>
          ) : (
            <>
              <section className="entity-detail__section">
                <div className="entity-detail__section-title">Description</div>
                <textarea
                  className="field__input field__input--textarea entity-detail__description-input"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={8}
                  placeholder="Add a description here"
                />
              </section>
              {entityType === "project" ? (
                <section className="entity-detail__section">
                  <div className="entity-detail__section-title">Remote Repo</div>
                  <div className="entity-detail__inline-save-field">
                    <input
                      className="field__input entity-detail__inline-save-input"
                      value={remoteRepo}
                      onChange={(event) => setRemoteRepo(event.target.value)}
                      placeholder="Repository name or remote URL"
                    />
                    <button
                      type="button"
                      className="entity-detail__inline-save-button"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>
                  {repoStatusText ? (
                    <div
                      className={`entity-detail__repo-status entity-detail__repo-status--${projectRepoLink?.clone_status || "idle"}`}
                    >
                      {repoStatusText}
                    </div>
                  ) : null}
                  {projectRepoLink && ["queued", "cloning"].includes(projectRepoLink.clone_status) ? (
                    <div className="entity-detail__repo-progress" aria-hidden="true">
                      <div
                        className="entity-detail__repo-progress-bar"
                        style={{ width: `${Math.max(projectRepoLink.clone_progress || 4, 4)}%` }}
                      />
                    </div>
                  ) : null}
                  <div className="entity-detail__section-title entity-detail__section-title--spaced">Runtime Identities</div>
                  <div className="entity-detail__selection-list">
                    {availableProjectIdentities.length > 0 ? availableProjectIdentities.map((identityName) => (
                      <label key={identityName} className="entity-detail__selection-item">
                        <input
                          type="checkbox"
                          checked={selectedProjectIdentities.includes(identityName)}
                          onChange={() => toggleSelection(identityName, selectedProjectIdentities, setSelectedProjectIdentities)}
                        />
                        <span>{identityName}</span>
                      </label>
                    )) : (
                      <div className="entity-detail__selection-copy">No identities defined in the secrets layer.</div>
                    )}
                  </div>
                  <div className="entity-detail__section-title entity-detail__section-title--spaced">Runtime Environment Variables</div>
                  <div className="entity-detail__selection-list">
                    {availableProjectEnvironmentVariables.length > 0 ? availableProjectEnvironmentVariables.map((variableName) => (
                      <label key={variableName} className="entity-detail__selection-item">
                        <input
                          type="checkbox"
                          checked={selectedProjectEnvironmentVariables.includes(variableName)}
                          onChange={() => toggleSelection(
                            variableName,
                            selectedProjectEnvironmentVariables,
                            setSelectedProjectEnvironmentVariables,
                          )}
                        />
                        <span>{variableName}</span>
                      </label>
                    )) : (
                      <div className="entity-detail__selection-copy">No environment variables defined in the secrets layer.</div>
                    )}
                  </div>
                </section>
              ) : (
                <>
                  <section className="entity-detail__section">
                    <div className="entity-detail__section-title">Task Properties</div>
                    <div className="entity-detail__selection-copy">Arbitrary task-scoped key/value pairs.</div>
                    <div className="entity-detail__property-list">
                      {taskProperties.map((property, index) => (
                        <div key={property.id || `draft-${index}`} className="entity-detail__property-row">
                          <input
                            className="field__input"
                            value={property.key || ""}
                            onChange={(event) => updateTaskPropertyDraft(index, "key", event.target.value)}
                            placeholder="key"
                          />
                          <input
                            className="field__input"
                            value={property.value || ""}
                            onChange={(event) => updateTaskPropertyDraft(index, "value", event.target.value)}
                            placeholder="value"
                          />
                          <button
                            type="button"
                            className="secondary-button danger-text-button"
                            onClick={() => removeTaskPropertyDraft(index)}
                            disabled={saving}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="modal-actions entity-detail__actions">
                      <button type="button" className="secondary-button" onClick={addTaskPropertyDraft} disabled={saving}>
                        Add Property
                      </button>
                    </div>
                  </section>
                  <div className="modal-actions entity-detail__actions">
                    <button type="button" className="primary-button" onClick={handleSave} disabled={saving}>
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </>
              )}

              <section className="entity-detail__section">
                <div className="entity-detail__section-title">Add Comment</div>
                <label className="field">
                  <textarea
                    className="field__input field__input--textarea-sm"
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    rows={4}
                    placeholder="Add context, status, or guidance."
                  />
                </label>
                <div className="modal-actions entity-detail__actions">
                  <button type="button" className="primary-button" onClick={handleAddComment} disabled={savingComment}>
                    {savingComment ? "Posting..." : "Add Comment"}
                  </button>
                </div>
              </section>

              <section className="entity-detail__section">
                <div className="entity-detail__section-title">Comments</div>
                <div className="entity-detail__comments-list">
                  {orderedComments.length === 0 ? (
                    <div className="empty-copy empty-copy--inset">No comments yet.</div>
                  ) : orderedComments.map((comment) => (
                    <article key={comment.id} className="entity-detail__comment">
                      <div className="entity-detail__comment-meta">
                        <span>{comment.author_role}</span>
                        <span>•</span>
                        <span>{formatDateTime(comment.created_at)}</span>
                      </div>
                      <div className="entity-detail__comment-body">{comment.body_md}</div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
          {error ? <div className="banner banner--error">{error}</div> : null}
        </div>
      </section>
    </div>
  );
}

function ProjectDialog({
  mode,
  form,
  error,
  saving,
  onChange,
  onClose,
  onSubmit,
  onDelete,
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel__header">
          <div>
            <div className="panel__title" id="project-dialog-title">
              {mode === "create" ? "New Project" : "Edit Project"}
            </div>
            <div className="panel__subtitle">
              {mode === "create"
                ? "Create a new top-level project with a name and description."
                : "Update the saved project name and description."}
            </div>
          </div>
        </div>

        <form className="modal-form" onSubmit={onSubmit}>
          <label className="field">
            <span className="field__label">Name</span>
            <input
              className="field__input"
              name="name"
              value={form.name}
              onChange={onChange}
              placeholder="Project name"
              autoFocus
              required
            />
          </label>

          <label className="field">
            <span className="field__label">Description</span>
            <textarea
              className="field__input field__input--textarea"
              name="description"
              value={form.description}
              onChange={onChange}
              placeholder="Describe the purpose and scope of this project."
              rows={5}
            />
          </label>

          <label className="field">
            <span className="field__label">Remote Repo</span>
            <input
              className="field__input"
              name="remoteRepo"
              value={form.remoteRepo}
              onChange={onChange}
              placeholder="Repository name or remote URL"
            />
          </label>

          {error ? <div className="banner banner--error">{error}</div> : null}

          <div className="modal-actions">
            {mode === "edit" ? (
              <button type="button" className="secondary-button danger-text-button" onClick={onDelete} disabled={saving}>
                Delete project
              </button>
            ) : null}
            <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? (mode === "create" ? "Creating..." : "Saving...") : mode === "create" ? "Create project" : "Save changes"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function SubprojectDialog({
  parentProject,
  projects,
  form,
  error,
  saving,
  onChange,
  onClose,
  onSubmit,
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="subproject-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel__header">
          <div className="panel__title" id="subproject-dialog-title">
            {formatSubprojectCreationPath(parentProject, projects)}
          </div>
        </div>

        <form className="modal-form" onSubmit={onSubmit}>
          <label className="field">
            <span className="field__label">Name</span>
            <input
              className="field__input"
              name="name"
              value={form.name}
              onChange={onChange}
              placeholder="Integration Layer"
              autoFocus
              required
            />
          </label>

          <label className="field">
            <span className="field__label">Description</span>
            <textarea
              className="field__input field__input--textarea"
              name="description"
              value={form.description}
              onChange={onChange}
              placeholder="Describe the scope of this sub-project."
              rows={4}
            />
          </label>

          <label className="field">
            <span className="field__label">Remote Repo</span>
            <input
              className="field__input"
              name="remoteRepo"
              value={form.remoteRepo}
              onChange={onChange}
              placeholder="Repository name or remote URL"
            />
          </label>

          {error ? <div className="banner banner--error">{error}</div> : null}

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Creating..." : "Create sub-project"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function TaskDialog({
  taskKind,
  project,
  form,
  error,
  saving,
  mode,
  onChange,
  onClose,
  onSubmit,
  onDelete,
}) {
  const isEdit = mode === "edit";
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel__header">
          <div>
            <div className="panel__title" id="task-dialog-title">
              {isEdit ? "Edit" : "New"} {taskKind} Task
            </div>
            <div className="panel__subtitle">
              Project: {project?.name}
            </div>
          </div>
        </div>

        <form className="modal-form" onSubmit={onSubmit}>
          <label className="field">
            <span className="field__label">Title</span>
            <input
              className="field__input"
              name="title"
              value={form.title}
              onChange={onChange}
              placeholder={`${taskKind} task title`}
              autoFocus
              required
            />
          </label>

          <label className="field">
            <span className="field__label">Description</span>
            <textarea
              className="field__input field__input--textarea"
              name="description"
              value={form.description}
              onChange={onChange}
              placeholder={`Describe this ${taskKind.toLowerCase()} task.`}
              rows={4}
            />
          </label>

          <label className="field">
            <span className="field__label">Tags</span>
            <input
              className="field__input"
              name="tags"
              value={form.tags || ""}
              onChange={onChange}
              placeholder="Comma-separated tags"
            />
          </label>

          {error ? <div className="banner banner--error">{error}</div> : null}

          <div className="modal-actions">
            {isEdit ? (
              <button type="button" className="secondary-button danger-text-button" onClick={onDelete} disabled={saving}>
                Delete task
              </button>
            ) : null}
            <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Saving..." : isEdit ? `Save ${taskKind} task` : `Create ${taskKind} task`}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ResearchTaskDialog({
  project,
  form,
  error,
  saving,
  mode,
  onChange,
  onClose,
  onSubmit,
  onDelete,
}) {
  const isEdit = mode === "edit";
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="research-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel__header">
          <div>
            <div className="panel__title" id="research-dialog-title">
              {isEdit ? "Edit" : "New"} Research Task
            </div>
            <div className="panel__subtitle">
              Project: {project?.name}
            </div>
          </div>
        </div>

        <form className="modal-form" onSubmit={onSubmit}>
          <label className="field">
            <span className="field__label">Title</span>
            <input
              className="field__input"
              name="title"
              value={form.title}
              onChange={onChange}
              placeholder="Short label for this research"
              autoFocus
              required
            />
          </label>

          <label className="field">
            <span className="field__label">Question</span>
            <textarea
              className="field__input field__input--textarea-sm"
              name="question"
              value={form.question}
              onChange={onChange}
              placeholder="What are you trying to find out?"
              rows={2}
            />
          </label>

          <label className="field">
            <span className="field__label">Context</span>
            <textarea
              className="field__input field__input--textarea-sm"
              name="context"
              value={form.context}
              onChange={onChange}
              placeholder="Background, constraints, or scope"
              rows={2}
            />
          </label>

          <label className="field">
            <span className="field__label">Tags</span>
            <input
              className="field__input"
              name="tags"
              value={form.tags || ""}
              onChange={onChange}
              placeholder="Comma-separated tags"
            />
          </label>

          {error ? <div className="banner banner--error">{error}</div> : null}

          <div className="modal-actions">
            {isEdit ? (
              <button type="button" className="secondary-button danger-text-button" onClick={onDelete} disabled={saving}>
                Delete task
              </button>
            ) : null}
            <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Saving..." : isEdit ? "Save Research task" : "Create Research task"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ConfirmDialog({ title, message, confirmLabel, onCancel, onConfirm, busy = false }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={busy ? undefined : onCancel}>
      <section
        className="modal-card modal-card--confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog__body">
          <div className="confirm-dialog__title" id="confirm-dialog-title">{title}</div>
          <div className="confirm-dialog__message">{message}</div>
        </div>
        <div className="confirm-dialog__footer modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="primary-button danger-solid-button" onClick={onConfirm} disabled={busy}>
            {busy ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function ExecuteTaskDialog({ task, onClose, onStartedExecution }) {
  const [step, setStep] = useState(1);
  const [workflows, setWorkflows] = useState([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(true);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [agents, setAgents] = useState([]);
  const [agentModelsMap, setAgentModelsMap] = useState({});
  const [agentAssignments, setAgentAssignments] = useState({});
  const [modelAssignments, setModelAssignments] = useState({});
  const [skillDefaultsMap, setSkillDefaultsMap] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoadingWorkflows(true);
    Promise.all([fetchWorkflows(), fetchAgents(), fetchSkillDefaults()])
      .then(([wfData, agentData, defaultsData]) => {
        if (cancelled) return;
        setWorkflows(wfData);
        setAgents(agentData.filter((a) => a.is_enabled));
        agentData.forEach((agent) => {
          fetchAgentModels(agent.id).then((models) => {
            if (!cancelled) {
              setAgentModelsMap((prev) => ({ ...prev, [agent.key]: models.filter((m) => m.is_enabled === 1) }));
            }
          });
        });
        const map = {};
        defaultsData.forEach((d) => {
          map[d.skill_name] = { default_agent_key: d.default_agent_key, default_model_id: d.default_model_id };
        });
        setSkillDefaultsMap(map);
      })
      .catch(() => {
        if (!cancelled) { setWorkflows([]); setAgents([]); }
      })
      .finally(() => {
        if (!cancelled) setLoadingWorkflows(false);
      });
    return () => { cancelled = true; };
  }, []);

  function getDefaultModelForAgent(agentKey) {
    const models = agentModelsMap[agentKey] || [];
    const def = models.find((m) => m.is_default === 1);
    return def ? def.model_id : models[0]?.model_id || "";
  }

  function getModelsForAgent(agentKey) {
    return agentModelsMap[agentKey] || [];
  }

  async function handlePickWorkflow(wf) {
    try {
      const detail = await fetchWorkflowDetail(wf.name);
      setSelectedWorkflow(detail);
      setSubmitError("");
      const asgn = {};
      const mdl = {};
      const fallbackAgent = "claude";
      (detail.steps || []).forEach((phase, pi) => {
        phase.forEach((skill) => {
          const key = `${pi}-${skill}`;
          const sd = skillDefaultsMap[skill];
          const agentKey = sd?.default_agent_key || fallbackAgent;
          asgn[key] = agentKey;
          mdl[key] = sd?.default_model_id || (agentKey ? getDefaultModelForAgent(agentKey) : "");
        });
      });
      setAgentAssignments(asgn);
      setModelAssignments(mdl);
      setStep(2);
    } catch {
      // stay on step 1
    }
  }

  function handleAgentChange(key, agentKey) {
    setAgentAssignments((prev) => ({ ...prev, [key]: agentKey }));
    setModelAssignments((prev) => ({ ...prev, [key]: agentKey ? getDefaultModelForAgent(agentKey) : "" }));
  }

  function handleModelChange(key, modelId) {
    setModelAssignments((prev) => ({ ...prev, [key]: modelId }));
  }

  async function handleStart() {
    if (!selectedWorkflow) return;
    const steps = {};
    (selectedWorkflow.steps || []).forEach((phase, pi) => {
      steps[String(pi)] = phase.map((skill) => {
        const key = `${pi}-${skill}`;
        return {
          skill,
          agent: agentAssignments[key] || "",
          model: modelAssignments[key] || "",
        };
      });
    });

    setIsSubmitting(true);
    setSubmitError("");
    try {
      await createProcess({
        task_id: task.id,
        workflow_name: selectedWorkflow.name,
        steps,
      });
      await onStartedExecution?.(task);
      onClose();
    } catch (error) {
      setSubmitError(error.message || "Unable to start process.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card modal-card--execute"
        role="dialog"
        aria-modal="true"
        aria-labelledby="execute-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel__header">
          <div className="panel__header-row">
            {step === 2 ? (
              <button type="button" className="icon-button" onClick={() => setStep(1)}>
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
            ) : null}
            <div>
              <div className="panel__title" id="execute-dialog-title">
                {step === 1 ? "Select Workflow" : task.title}
              </div>
              {step === 2 && selectedWorkflow ? (
                <div className="panel__subtitle">{selectedWorkflow.name}</div>
              ) : null}
            </div>
          </div>
        </div>

        {step === 1 ? (
          <div className="execute-dialog__body">
            {loadingWorkflows ? (
              <div className="empty-copy">Loading workflows...</div>
            ) : workflows.length === 0 ? (
              <div className="empty-copy">No workflows configured.</div>
            ) : (
              <div className="execute-dialog__list">
                {workflows.map((wf) => (
                  <button
                    key={wf.name}
                    type="button"
                    className="execute-dialog__workflow-row"
                    onClick={() => handlePickWorkflow(wf)}
                  >
                    <Workflow size={14} strokeWidth={2} />
                    <span>{wf.name}</span>
                    <ChevronRight size={14} strokeWidth={2} className="execute-dialog__chevron" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="execute-dialog__body">
            <div className="execute-dialog__phases">
              {(selectedWorkflow?.steps || []).map((phase, pi) => (
                <div key={pi} className="execute-dialog__phase">
                  <div className="execute-dialog__phase-title">Phase {pi + 1}</div>
                  <div className="execute-dialog__phase-skills">
                    {phase.map((skill) => {
                      const key = `${pi}-${skill}`;
                      const currentAgent = agentAssignments[key] || "";
                      const availableModels = getModelsForAgent(currentAgent);
                      return (
                        <div key={key} className="execute-dialog__skill-row">
                          <span className="execute-dialog__skill-name">{skill}</span>
                          <div className="execute-dialog__selects">
                            <select
                              className="field__input execute-dialog__select"
                              value={currentAgent}
                              onChange={(e) => handleAgentChange(key, e.target.value)}
                            >
                              {agents.map((a) => (
                                <option key={a.key} value={a.key}>{a.name}</option>
                              ))}
                            </select>
                            <select
                              className="field__input execute-dialog__select"
                              value={modelAssignments[key] || ""}
                              onChange={(e) => handleModelChange(key, e.target.value)}
                              disabled={!currentAgent}
                            >
                              {availableModels.length === 0 ? (
                                <option value="">—</option>
                              ) : (
                                availableModels.map((m) => (
                                  <option key={m.model_id} value={m.model_id}>{m.model_id}</option>
                                ))
                              )}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {submitError ? <div className="form-error">{submitError}</div> : null}
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={handleStart} disabled={isSubmitting}>
                {isSubmitting ? "Starting..." : "Start"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ProjectPicker({ projects, onSelect, onOpenSettings }) {
  return (
    <section className="project-picker">
      {projects.map((project) => (
        <article
          key={project.id}
          className="project-chip"
        >
          <button type="button" className="project-chip__main" onClick={() => onSelect(project.id)}>
            <span className="project-chip__avatar">{initials(project.name)}</span>
            <span className="project-chip__body">
              <span className="project-chip__name">{project.name}</span>
              <span className="project-chip__slug">{project.slug}</span>
            </span>
          </button>
          <button
            type="button"
            className="project-chip__settings"
            onClick={() => onOpenSettings(project)}
            aria-label={`Edit ${project.name}`}
          >
            ⋯
          </button>
        </article>
      ))}
    </section>
  );
}

function ProjectWorkspace({
  projects,
  onSelectProject,
  onOpenEditProject,
}) {
  const topLevelProjects = useMemo(
    () => projects.filter((projectItem) => projectItem.parent_project_id == null),
    [projects],
  );

  return (
    <div className="view-stack">
      <ProjectPicker
        projects={topLevelProjects}
        onSelect={onSelectProject}
        onOpenSettings={onOpenEditProject}
      />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="loading-shell">
      <div className="loading-block loading-block--hero" />
      <div className="loading-grid">
        <div className="loading-block" />
        <div className="loading-block" />
      </div>
    </div>
  );
}

function PendingMessagesIndicator({ count, onClick }) {
  return (
    <button
      type="button"
      className={`pending-messages${count > 0 ? " pending-messages--active" : ""}`}
      aria-label={count > 0 ? `${count} pending messages` : "No pending messages"}
      onClick={onClick}
    >
      <span className="pending-messages__icon" aria-hidden="true">
        <MessageSquareMore size={16} strokeWidth={2.1} />
      </span>
      {count > 0 ? <span className="pending-messages__badge">{count}</span> : null}
    </button>
  );
}

function PendingMessagesDialog({
  messages,
  currentIndex,
  responseText,
  responding,
  error,
  onClose,
  onPrevious,
  onNext,
  onResponseTextChange,
  onRespond,
  onAttachToSession,
}) {
  const [showContextDetails, setShowContextDetails] = useState(false);
  const currentMessage = messages[currentIndex] || null;
  const messageContext = currentMessage
    ? [
        currentMessage.project_name || currentMessage.project_title || "—",
        currentMessage.task_title || "—",
      ].join(" / ")
    : "";
  const messageContextDetails = currentMessage
    ? [
        currentMessage.workflow_name ? `workflow: ${currentMessage.workflow_name}` : null,
        currentMessage.phase != null ? `phase: ${currentMessage.phase}` : null,
        currentMessage.skill ? `skill: ${currentMessage.skill}` : null,
      ].filter(Boolean).join(" / ")
    : "";
  const simpleInteractionBody =
    currentMessage?.message_type === "simpleInteraction" && Array.isArray(currentMessage.content)
      ? currentMessage.content[0]?.body || ""
      : "";
  const summonReason =
    currentMessage?.message_type === "summon" && Array.isArray(currentMessage.content)
      ? currentMessage.content[0]?.reason || ""
      : "";

  useEffect(() => {
    setShowContextDetails(false);
  }, [currentMessage?.id]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
          <section
            className="modal-card modal-card--messages"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pending-messages-title"
        onClick={(event) => event.stopPropagation()}
      >
            <div className="panel__header">
              <div className="panel__header-row">
                {currentMessage ? (
                  <div className="messages-dialog__session-wrap">
                    <button
                      type="button"
                      className="messages-dialog__session"
                      onClick={() => setShowContextDetails((current) => !current)}
                    >
                      {messageContext}
                    </button>
                    {showContextDetails && messageContextDetails ? (
                      <div className="messages-dialog__session-details">{messageContextDetails}</div>
                    ) : null}
                  </div>
                ) : (
                  <div />
                )}
                <div className="messages-dialog__nav">
                  <button type="button" className="icon-button" aria-label="Close messages" onClick={onClose}>
                    ×
                  </button>
                </div>
              </div>
            </div>

        <div className="messages-dialog__body">
          {currentMessage ? (
            <>
              {currentMessage.message_type === "simpleInteraction" ? (
                <div className="messages-dialog__response">
                  <div
                    className="messages-dialog__simple-body messages-dialog__html-body"
                    dangerouslySetInnerHTML={{ __html: simpleInteractionBody || "<p>No message body.</p>" }}
                  />
                  <label className="field">
                    <span className="field__label">Respond</span>
                    <textarea
                      className="field__input field__input--textarea"
                      value={responseText}
                      onChange={(event) => onResponseTextChange(event.target.value)}
                      rows={3}
                      placeholder="Type a response to send back through the orchestrator."
                    />
                  </label>
                  <div className="messages-dialog__footer">
                    <div className="messages-dialog__pager">
                      {currentIndex > 0 ? (
                        <button type="button" className="icon-button" onClick={onPrevious}>
                          ‹
                        </button>
                      ) : null}
                      {currentIndex < messages.length - 1 ? (
                        <button
                          type="button"
                          className="icon-button"
                          onClick={onNext}
                        >
                          ›
                        </button>
                      ) : null}
                    </div>
                    <div className="modal-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={onRespond}
                      disabled={!responseText.trim() || responding}
                    >
                      <span>{responding ? "Sending..." : "Respond"}</span>
                    </button>
                    </div>
                  </div>
                </div>
              ) : currentMessage.message_type === "summon" ? (
                <div className="messages-dialog__response">
                  <div
                    className="messages-dialog__simple-body messages-dialog__html-body"
                    dangerouslySetInnerHTML={{ __html: summonReason || "<p>This session is requesting your attention.</p>" }}
                  />
                  <div className="messages-dialog__footer">
                    <div className="messages-dialog__pager">
                      {currentIndex > 0 ? (
                        <button type="button" className="icon-button" onClick={onPrevious}>
                          ‹
                        </button>
                      ) : null}
                      {currentIndex < messages.length - 1 ? (
                        <button
                          type="button"
                          className="icon-button"
                          onClick={onNext}
                        >
                          ›
                        </button>
                      ) : null}
                    </div>
                    <div className="modal-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => onAttachToSession(currentMessage)}
                        disabled={!currentMessage.session_id || responding}
                      >
                        <span>{responding ? "Attaching..." : "Attach to Session"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="empty-copy">No interaction handler yet for this message type.</div>
              )}

              {error ? <div className="banner banner--error">{error}</div> : null}
            </>
          ) : (
            <div className="skills-config__empty">
              <div className="skills-config__empty-title">No pending messages.</div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function App() {
  const [activeView, setActiveView] = useState(() => {
    const stored = window.localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY);
    return RESTORABLE_VIEWS.has(stored) ? stored : "command-center";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  });
  const [projectsPane, setProjectsPane] = useState(() => {
    const stored = window.localStorage.getItem(PROJECTS_PANE_STORAGE_KEY);
    return stored === "flow" ? "flow" : "picker";
  });
  const [projectDialog, setProjectDialog] = useState({ open: false, mode: "create", project: null });
  const [projectForm, setProjectForm] = useState({ name: "", description: "", remoteRepo: "" });
  const [projectFormError, setProjectFormError] = useState("");
  const [savingProject, setSavingProject] = useState(false);
  const [flowFocusedProject, setFlowFocusedProject] = useState(null);
  const previousSelectedProjectIdRef = useRef(null);
  const [taskMenuOpen, setTaskMenuOpen] = useState(false);
  const [taskDialog, setTaskDialog] = useState({ open: false, typeName: "", project: null, mode: "create", task: null });
  const [taskForm, setTaskForm] = useState({ title: "", description: "", question: "", context: "", tags: "" });
  const [taskFormError, setTaskFormError] = useState("");
  const [savingTask, setSavingTask] = useState(false);
  const [executeDialog, setExecuteDialog] = useState({ open: false, task: null });
  const [entityAssetsDialog, setEntityAssetsDialog] = useState({ open: false, entityType: "", entityId: "", entityLabel: "" });
  const [entityDetailDialog, setEntityDetailDialog] = useState({ open: false, entityType: "", entityId: "" });
  const [subprojectDialog, setSubprojectDialog] = useState({ open: false, parentProject: null });
  const [subprojectForm, setSubprojectForm] = useState({ name: "", description: "", remoteRepo: "" });
  const [subprojectFormError, setSubprojectFormError] = useState("");
  const [savingSubproject, setSavingSubproject] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, kind: "", entity: null });
  const [flowReloadToken, setFlowReloadToken] = useState(0);
  const [pendingMessages, setPendingMessages] = useState([]);
  const [messagesDialogOpen, setMessagesDialogOpen] = useState(false);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [messageResponseText, setMessageResponseText] = useState("");
  const [respondingToMessage, setRespondingToMessage] = useState(false);
  const [messageResponseError, setMessageResponseError] = useState("");
  const [terminalDialog, setTerminalDialog] = useState({ open: false, sessionName: "", title: "" });
  const [homeActivityCount, setHomeActivityCount] = useState(0);
  const { theme, toggleTheme } = useTheme();
  const {
    projects,
    setProjects,
    selectedProjectId,
    setSelectedProjectId,
    tasks,
    setTasks,
    subprojects,
    setSubprojects,
    properties,
    setProperties,
    loading,
    error,
  } = useWorkspaceData();

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, activeView);
  }, [activeView]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(PROJECTS_PANE_STORAGE_KEY, projectsPane);
  }, [projectsPane]);

  useEffect(() => {
    if (projectsPane !== "flow") return;
    if (selectedProject) return;
    setProjectsPane("picker");
  }, [projectsPane, selectedProject]);

  useEffect(() => {
    if (projectsPane !== "flow") return;
    const previousSelectedProjectId = previousSelectedProjectIdRef.current;
    const selectedProjectChanged = previousSelectedProjectId !== selectedProject?.id;
    previousSelectedProjectIdRef.current = selectedProject?.id || null;

    setFlowFocusedProject((current) => {
      if (!selectedProject) {
        return null;
      }
      if (selectedProjectChanged || !current?.id) {
        return selectedProject;
      }
      if (current.id === selectedProject.id) {
        return selectedProject;
      }
      const refreshedFocusedProject = projects.find((project) => project.id === current.id);
      if (!refreshedFocusedProject) {
        return selectedProject;
      }
      let cursor = refreshedFocusedProject;
      while (cursor?.parent_project_id) {
        if (cursor.parent_project_id === selectedProject.id) {
          return refreshedFocusedProject;
        }
        cursor = projects.find((project) => project.id === cursor.parent_project_id) || null;
      }
      return selectedProject;
    });
  }, [projectsPane, selectedProject, projects]);

  useEffect(() => {
    setTaskMenuOpen(false);
  }, [activeView, projectsPane, flowFocusedProject?.id]);

  useEffect(() => {
    let active = true;

    async function pollPendingMessages() {
      try {
        const pending = await fetchPendingMessages();
        if (!active) return;
        const nextMessages = Array.isArray(pending) ? pending : [];
        const attachedSessionId = terminalDialog.open ? terminalDialog.sessionName : "";

        if (!attachedSessionId) {
          setPendingMessages(nextMessages);
          return;
        }

        const matchingMessages = nextMessages.filter(
          (message) => message?.session_id === attachedSessionId && message?.message_id,
        );

        for (const message of matchingMessages) {
          if (autoAttachedMessageIdsRef.current.has(message.message_id)) {
            continue;
          }
          autoAttachedMessageIdsRef.current.add(message.message_id);
          try {
            const attachedAt = formatSessionAttachTime();
            await respondToMessage(message.message_id, `User attached to session at ${attachedAt}.`);
          } catch {
            autoAttachedMessageIdsRef.current.delete(message.message_id);
          }
        }

        const filteredMessages = nextMessages.filter((message) => message?.session_id !== attachedSessionId);
        if (!active) return;
        setPendingMessages(filteredMessages);
      } catch {
        if (!active) return;
        setPendingMessages([]);
      }
    }

    pollPendingMessages();
    const intervalId = window.setInterval(pollPendingMessages, 5000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [terminalDialog.open, terminalDialog.sessionName]);

  useEffect(() => {
    if (!pendingMessages.length) {
      setCurrentMessageIndex(0);
      return;
    }
    setCurrentMessageIndex((current) => Math.min(current, pendingMessages.length - 1));
  }, [pendingMessages]);

  useEffect(() => {
    setMessageResponseText("");
    setMessageResponseError("");
  }, [currentMessageIndex, messagesDialogOpen]);

  useEffect(() => {
    if (activeView === "command-center") {
      setHomeActivityCount(0);
    }
  }, [activeView]);


  useEffect(() => {
    if (!projectDialog.open) return;

    function handleKeyDown(event) {
      if (event.key === "Escape" && !savingProject) {
        setProjectDialog({ open: false, mode: "create", project: null });
      setProjectForm({ name: "", description: "", remoteRepo: "" });
        setProjectFormError("");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [projectDialog.open, savingProject]);

  useEffect(() => {
    if (!subprojectDialog.open) return;

    function handleKeyDown(event) {
      if (event.key === "Escape" && !savingSubproject) {
        setSubprojectDialog({ open: false, parentProject: null });
      setSubprojectForm({ name: "", description: "", remoteRepo: "" });
        setSubprojectFormError("");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [subprojectDialog.open, savingSubproject]);

  useEffect(() => {
    if (!taskDialog.open) return;

    function handleKeyDown(event) {
      if (event.key === "Escape" && !savingTask) {
        setTaskDialog({ open: false, typeName: "", project: null });
        setTaskFormError("");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [taskDialog.open, savingTask]);

  async function reloadProjectsAndContext(nextSelectedProjectId = selectedProjectId) {
    const nextProjects = await fetchProjects();
    setProjects(nextProjects);

    if (!nextSelectedProjectId) {
      setSelectedProjectId(null);
      setTasks([]);
      setSubprojects([]);
      setProperties([]);
      return;
    }

    setSelectedProjectId(nextSelectedProjectId);
    const [taskData, subprojectData, propertyData] = await Promise.all([
      fetchProjectTasks(nextSelectedProjectId),
      fetchProjectSubprojects(nextSelectedProjectId),
      fetchProjectProperties(nextSelectedProjectId),
    ]);
    setTasks(taskData);
    setSubprojects(subprojectData);
    setProperties(propertyData);
  }

  function openCreateProjectDialog() {
    setProjectDialog({ open: true, mode: "create", project: null });
    setProjectForm({ name: "", description: "", remoteRepo: "" });
    setProjectFormError("");
  }

  function openEditProjectDialog(project) {
    setProjectDialog({ open: true, mode: "edit", project });
    setProjectForm({ name: project.name, description: project.description_md || "", remoteRepo: "" });
    setProjectFormError("");
  }

  function closeProjectDialog() {
    if (savingProject) return;
    setProjectDialog({ open: false, mode: "create", project: null });
    setProjectFormError("");
  }

  function openSubprojectDialog(parentProject) {
    setSubprojectDialog({ open: true, parentProject });
    setSubprojectForm({ name: "", description: "", remoteRepo: "" });
    setSubprojectFormError("");
  }

  function closeSubprojectDialog() {
    if (savingSubproject) return;
    setSubprojectDialog({ open: false, parentProject: null });
    setSubprojectFormError("");
  }

  function openTaskDialog(typeName, targetProject = flowFocusedProject) {
    if (!targetProject) return;
    setTaskDialog({ open: true, typeName, project: targetProject, mode: "create", task: null });
    setTaskForm({ title: "", description: "", question: "", context: "", tags: "" });
    setTaskFormError("");
    setTaskMenuOpen(false);
  }

  async function openEditTaskDialog(task) {
    const project = flowFocusedProject || selectedProject;
    if (!project) return;

    const taskTypes = await fetchTaskTypes(project.id);
    const taskType = taskTypes.find((t) => t.id === task.task_type_id);
    const typeName = taskType?.name || "Work";

    const form = {
      title: task.title,
      description: "",
      question: "",
      context: "",
      tags: (task.tags || []).map((tag) => tag.name).join(", "),
    };

    if (typeName === "Research" && task.description_md) {
      const questionMatch = task.description_md.match(/## Question\n([\s\S]*?)(?=\n## |$)/);
      const contextMatch = task.description_md.match(/## Context\n([\s\S]*?)(?=\n## |$)/);
      form.question = questionMatch ? questionMatch[1].trim() : "";
      form.context = contextMatch ? contextMatch[1].trim() : "";
    } else {
      form.description = task.description_md || "";
    }

    setTaskDialog({ open: true, typeName, project, mode: "edit", task });
    setTaskForm(form);
    setTaskFormError("");
  }

  function closeTaskDialog() {
    if (savingTask) return;
    setTaskDialog({ open: false, typeName: "", project: null, mode: "create", task: null });
    setTaskFormError("");
  }

  function handleProjectFormChange(event) {
    const { name, value } = event.target;
    setProjectForm((current) => ({ ...current, [name]: value }));
  }

  function handleSubprojectFormChange(event) {
    const { name, value } = event.target;
    setSubprojectForm((current) => ({ ...current, [name]: value }));
  }

  function handleTaskFormChange(event) {
    const { name, value } = event.target;
    setTaskForm((current) => ({ ...current, [name]: value }));
  }

  function requestDeleteProject(targetProject) {
    if (!targetProject) return;
    setConfirmDialog({ open: true, kind: "project", entity: targetProject });
  }

  function requestDeleteTask(targetTask) {
    if (!targetTask) return;
    setConfirmDialog({ open: true, kind: "task", entity: targetTask });
  }

  async function handleConfirmDelete() {
    if (!confirmDialog.entity) return;
    if (confirmDialog.kind === "project") {
      const targetProject = confirmDialog.entity;
      setSavingProject(true);
      setProjectFormError("");
      try {
        await deleteProject(targetProject.id);
        setConfirmDialog({ open: false, kind: "", entity: null });
        setProjectDialog({ open: false, mode: "create", project: null });
        setEntityDetailDialog((current) =>
          current.entityType === "project" && current.entityId === targetProject.id
            ? { open: false, entityType: "", entityId: "" }
            : current,
        );
        if (selectedProjectId === targetProject.id) {
          await reloadProjectsAndContext(null);
          setProjectsPane("picker");
        } else {
          await reloadProjectsAndContext(selectedProjectId);
        }
        setFlowReloadToken((current) => current + 1);
      } catch (error) {
        setProjectFormError(error.message || "Unable to delete project.");
      } finally {
        setSavingProject(false);
      }
      return;
    }

    const targetTask = confirmDialog.entity;
    setSavingTask(true);
    setTaskFormError("");
    try {
      await deleteTask(targetTask.id);
      setConfirmDialog({ open: false, kind: "", entity: null });
      setTaskDialog({ open: false, typeName: "", project: null, mode: "create", task: null });
      setEntityDetailDialog((current) =>
        current.entityType === "task" && current.entityId === targetTask.id
          ? { open: false, entityType: "", entityId: "" }
          : current,
      );
      if (selectedProjectId) {
        await reloadProjectsAndContext(selectedProjectId);
      }
      setFlowReloadToken((current) => current + 1);
    } catch (error) {
      setTaskFormError(error.message || "Unable to delete task.");
    } finally {
      setSavingTask(false);
    }
  }

  async function handleProjectSubmit(event) {
    event.preventDefault();

    const trimmedName = projectForm.name.trim();
    const trimmedDescription = projectForm.description.trim();
    const slug = slugifyProjectName(trimmedName);

    if (!trimmedName) {
      setProjectFormError("Project name is required.");
      return;
    }

    if (!slug) {
      setProjectFormError("Project name must contain letters or numbers.");
      return;
    }

    setSavingProject(true);
    setProjectFormError("");

    try {
      if (projectDialog.mode === "create") {
        const created = await createProject({
          name: trimmedName,
          slug,
          description_md: trimmedDescription || null,
          parent_project_id: null,
          created_by_role: "human",
          created_by_instance_key: "web-ui",
        });
        if (projectForm.remoteRepo.trim()) {
          await saveProjectRepoLink(created.id, { remote_url: projectForm.remoteRepo.trim() });
        }
        await reloadProjectsAndContext(created.id);
        setActiveView("projects");
        setProjectsPane("flow");
      } else if (projectDialog.project) {
        const updated = await updateProject(projectDialog.project.id, {
          name: trimmedName,
          slug,
          description_md: trimmedDescription || null,
        });
        await reloadProjectsAndContext(updated.id);
      }

      setProjectDialog({ open: false, mode: "create", project: null });
    } catch (error) {
      setProjectFormError(error.message || "Unable to save project.");
    } finally {
      setSavingProject(false);
    }
  }

  async function handleSubprojectSubmit(event) {
    event.preventDefault();

    const trimmedName = subprojectForm.name.trim();
    const trimmedDescription = subprojectForm.description.trim();
    const slug = slugifyProjectName(trimmedName);

    if (!trimmedName) {
      setSubprojectFormError("Sub-project name is required.");
      return;
    }

    if (!slug) {
      setSubprojectFormError("Sub-project name must contain letters or numbers.");
      return;
    }

    if (!subprojectDialog.parentProject) {
      setSubprojectFormError("Missing parent project.");
      return;
    }

    setSavingSubproject(true);
    setSubprojectFormError("");

    try {
      const createdSubproject = await createSubproject(subprojectDialog.parentProject.id, {
        name: trimmedName,
        slug,
        description_md: trimmedDescription || null,
        created_by_role: "human",
        created_by_instance_key: "web-ui",
      });
      if (subprojectForm.remoteRepo.trim()) {
        await saveProjectRepoLink(createdSubproject.id, { remote_url: subprojectForm.remoteRepo.trim() });
      }
      await reloadProjectsAndContext(selectedProjectId);
      setFlowReloadToken((current) => current + 1);
      setSubprojectDialog({ open: false, parentProject: null });
    } catch (error) {
      setSubprojectFormError(error.message || "Unable to create sub-project.");
    } finally {
      setSavingSubproject(false);
    }
  }

  async function handleTaskSubmit(event) {
    event.preventDefault();

    const trimmedTitle = taskForm.title.trim();

    if (!trimmedTitle) {
      setTaskFormError("Task title is required.");
      return;
    }

    if (!taskDialog.project) {
      setTaskFormError("Missing target project.");
      return;
    }

    setSavingTask(true);
    setTaskFormError("");

    try {
      const taskTypes = await fetchTaskTypes(taskDialog.project.id);
      const taskType = taskTypes.find(
        (item) => item.name === taskDialog.typeName || item.key === taskDialog.typeName.toLowerCase(),
      );

      if (!taskType) {
        throw new Error(`${taskDialog.typeName} task type is not configured for this project.`);
      }

      let descriptionMd = null;
      if (taskDialog.typeName === "Research") {
        const parts = [];
        if (taskForm.question.trim()) parts.push(`## Question\n${taskForm.question.trim()}`);
        if (taskForm.context.trim()) parts.push(`## Context\n${taskForm.context.trim()}`);
        descriptionMd = parts.length > 0 ? parts.join("\n\n") : null;
      } else {
        const trimmedDescription = taskForm.description.trim();
        descriptionMd = trimmedDescription || null;
      }
      const tagNames = Array.from(
        new Set(
          taskForm.tags
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      );

      if (taskDialog.mode === "edit" && taskDialog.task) {
        await updateTask(taskDialog.task.id, {
          title: trimmedTitle,
          description_md: descriptionMd,
          tag_names: tagNames,
        });
      } else {
        await createTask({
          title: trimmedTitle,
          description_md: descriptionMd,
          task_type_id: taskType.id,
          status: "unopened",
          created_by_role: "human",
          created_by_instance_key: "web-ui",
          project_id: taskDialog.project.id,
          parent_task_id: null,
          tag_names: tagNames,
        });
      }

      if (taskDialog.project.id === selectedProjectId) {
        await reloadProjectsAndContext(selectedProjectId);
      }
      setFlowReloadToken((t) => t + 1);

      closeTaskDialog();
    } catch (error) {
      setTaskFormError(error.message || "Unable to save task.");
    } finally {
      setSavingTask(false);
    }
  }

  function handleSidebarViewChange(nextView) {
    setActiveView(nextView);
    if (nextView === "projects") {
      setProjectsPane("picker");
    }
  }

  function openProjectFlow(projectId) {
    setSelectedProjectId(projectId);
    setProjectsPane("flow");
  }

  async function handleRespondToMessage() {
    const currentMessage = pendingMessages[currentMessageIndex];
    if (!currentMessage?.message_id || !messageResponseText.trim()) return;

    setRespondingToMessage(true);
    setMessageResponseError("");

    try {
      await respondToMessage(currentMessage.message_id, messageResponseText.trim());
      const pending = await fetchPendingMessages();
      const nextPendingMessages = Array.isArray(pending) ? pending : [];
      setPendingMessages(nextPendingMessages);
      setMessageResponseText("");
      if (nextPendingMessages.length === 0) {
        setMessagesDialogOpen(false);
      }
    } catch (error) {
      setMessageResponseError(error.message || "Unable to send response.");
    } finally {
      setRespondingToMessage(false);
    }
  }

  async function handleAttachToSessionMessage(message) {
    if (!message?.session_id) return;

    setTerminalDialog({
      open: true,
      sessionName: message.session_id,
      title: [
        message.project_name || message.project_title || "Untitled Project",
        message.task_title || "Untitled Task",
        message.skill || "Unknown Skill",
      ].join(" / "),
    });
    setMessagesDialogOpen(false);

    if (!message.message_id) return;

    setRespondingToMessage(true);
    setMessageResponseError("");
    try {
      const attachedAt = formatSessionAttachTime();
      await respondToMessage(message.message_id, `User attached to session at ${attachedAt}.`);
      const pending = await fetchPendingMessages();
      setPendingMessages(Array.isArray(pending) ? pending : []);
    } catch (error) {
      setMessageResponseError(error.message || "Unable to notify orchestrator about the session attach.");
    } finally {
      setRespondingToMessage(false);
    }
  }

  async function handleJoinSession(sessionId, title) {
    if (!sessionId) return;

    setTerminalDialog({
      open: true,
      sessionName: sessionId,
      title,
    });

    const matchingMessage = pendingMessages.find((message) => message.session_id === sessionId && message.message_id);
    if (!matchingMessage) return;

    setRespondingToMessage(true);
    setMessageResponseError("");
    try {
      const attachedAt = formatSessionAttachTime();
      await respondToMessage(matchingMessage.message_id, `User attached to session at ${attachedAt}.`);
      const pending = await fetchPendingMessages();
      setPendingMessages(Array.isArray(pending) ? pending : []);
    } catch (error) {
      setMessageResponseError(error.message || "Unable to notify orchestrator about the session join.");
    } finally {
      setRespondingToMessage(false);
    }
  }

  async function handleTaskStatusChange(task, status) {
    if (!task?.id || !status) return;
    await updateTask(task.id, { status });
    await reloadProjectsAndContext(selectedProjectId);
    setFlowReloadToken((current) => current + 1);
  }

  async function handleEntityDetailSaved() {
    await reloadProjectsAndContext(selectedProjectId);
    setFlowReloadToken((current) => current + 1);
  }

  return (
    <div className={`app-shell${sidebarCollapsed ? " app-shell--sidebar-collapsed" : ""}`}>
      <Sidebar
        activeView={activeView}
        onChangeView={handleSidebarViewChange}
        theme={theme}
        onToggleTheme={toggleTheme}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
        homeActivityCount={homeActivityCount}
      />

      <main className="workspace">
        <ShellHeader
          activeView={activeView}
          projectsPane={projectsPane}
          project={selectedProject}
          projects={projects}
          onPrimaryAction={openCreateProjectDialog}
          onBackToProjects={() => setProjectsPane("picker")}
        />

        {error ? <div className="banner banner--error">{error}</div> : null}

        {loading ? (
          <LoadingState />
        ) : activeView === "command-center" ? (
          <CommandCenter
            project={selectedProject}
            projects={projects}
            tasks={tasks}
            subprojects={subprojects}
            properties={properties}
            pendingMessageCount={pendingMessages.length}
            onOpenMessagesDialog={() => setMessagesDialogOpen(true)}
            onOpenProcessProject={(projectId) => {
              setActiveView("projects");
              openProjectFlow(projectId);
            }}
            onPanicStopComplete={async () => {
              const pending = await fetchPendingMessages();
              setPendingMessages(Array.isArray(pending) ? pending : []);
              if (selectedProjectId) {
                await reloadProjectsAndContext(selectedProjectId);
              } else {
                const nextProjects = await fetchProjects();
                setProjects(nextProjects);
              }
              setFlowReloadToken((current) => current + 1);
            }}
            onJoinSession={handleJoinSession}
          />
        ) : activeView === "skills-config" ? (
          <SkillsConfigScreen theme={theme} />
        ) : activeView === "agents-config" ? (
          <AgentsConfigScreen />
        ) : activeView === "orchestrator-config" ? (
          <OrchestratorConfigScreen />
        ) : activeView === "hooks-config" ? (
          <HookScriptsConfigScreen theme={theme} />
        ) : activeView === "secrets-config" ? (
          <SecretsConfigScreen theme={theme} onToggleTheme={toggleTheme} />
        ) : projectsPane === "flow" && selectedProject ? (
          <ProjectFlowView
            rootProject={selectedProject}
            focusedProject={flowFocusedProject}
            onFocusProject={setFlowFocusedProject}
            tasks={tasks}
            subprojects={subprojects}
            projects={projects}
            flowReloadToken={flowReloadToken}
            onCreateSubproject={openSubprojectDialog}
            onCreateFeature={(project) => openTaskDialog("Feature", project)}
            taskMenuOpen={taskMenuOpen}
            onToggleTaskMenu={() => setTaskMenuOpen((current) => !current)}
            onCreateTaskType={openTaskDialog}
            onEditTask={openEditTaskDialog}
            onExecuteTask={(task) => setExecuteDialog({ open: true, task })}
            onChangeTaskStatus={handleTaskStatusChange}
            onDeleteTask={requestDeleteTask}
            onOpenEntityAssets={(entityType, entityId, entityLabel) => setEntityAssetsDialog({ open: true, entityType, entityId, entityLabel })}
            onOpenEntityDetails={(entityType, entityId) => setEntityDetailDialog({ open: true, entityType, entityId })}
          />
        ) : (
          <ProjectWorkspace
            projects={projects}
            onSelectProject={openProjectFlow}
            onOpenEditProject={openEditProjectDialog}
          />
        )}
      </main>

      {confirmDialog.open ? (
        <ConfirmDialog
          title={confirmDialog.kind === "project" ? "Delete Project" : "Delete Task"}
          message={
            confirmDialog.kind === "project"
              ? `Delete project "${confirmDialog.entity?.name || ""}"?`
              : `Delete task "${confirmDialog.entity?.title || ""}"?`
          }
          confirmLabel={confirmDialog.kind === "project" ? "Delete project" : "Delete task"}
          busy={savingProject || savingTask}
          onCancel={() => setConfirmDialog({ open: false, kind: "", entity: null })}
          onConfirm={handleConfirmDelete}
        />
      ) : null}

      {projectDialog.open ? (
        <ProjectDialog
          mode={projectDialog.mode}
          form={projectForm}
          error={projectFormError}
          saving={savingProject}
          onChange={handleProjectFormChange}
          onClose={closeProjectDialog}
          onSubmit={handleProjectSubmit}
          onDelete={() => requestDeleteProject(projectDialog.project)}
        />
      ) : null}

      {subprojectDialog.open ? (
        <SubprojectDialog
          parentProject={subprojectDialog.parentProject}
          projects={projects}
          form={subprojectForm}
          error={subprojectFormError}
          saving={savingSubproject}
          onChange={handleSubprojectFormChange}
          onClose={closeSubprojectDialog}
          onSubmit={handleSubprojectSubmit}
        />
      ) : null}

      {taskDialog.open && taskDialog.typeName === "Research" ? (
        <ResearchTaskDialog
          project={taskDialog.project}
          form={taskForm}
          error={taskFormError}
          saving={savingTask}
          mode={taskDialog.mode}
          onChange={handleTaskFormChange}
          onClose={closeTaskDialog}
          onSubmit={handleTaskSubmit}
          onDelete={() => requestDeleteTask(taskDialog.task)}
        />
      ) : taskDialog.open ? (
        <TaskDialog
          taskKind={taskDialog.typeName}
          project={taskDialog.project}
          form={taskForm}
          error={taskFormError}
          saving={savingTask}
          mode={taskDialog.mode}
          onChange={handleTaskFormChange}
          onClose={closeTaskDialog}
          onSubmit={handleTaskSubmit}
          onDelete={() => requestDeleteTask(taskDialog.task)}
        />
      ) : null}

      {executeDialog.open ? (
        <ExecuteTaskDialog
          task={executeDialog.task}
          onStartedExecution={async (task) => {
            if (task?.id) {
              await updateTask(task.id, { status: "in_execution" });
              await reloadProjectsAndContext(selectedProjectId);
              setFlowReloadToken((current) => current + 1);
            }
            setHomeActivityCount((current) => current + 1);
          }}
          onClose={() => setExecuteDialog({ open: false, task: null })}
        />
      ) : null}

      {entityAssetsDialog.open ? (
        <EntityAssetsDialog
          entityType={entityAssetsDialog.entityType}
          entityId={entityAssetsDialog.entityId}
          entityLabel={entityAssetsDialog.entityLabel}
          onClose={() => setEntityAssetsDialog({ open: false, entityType: "", entityId: "", entityLabel: "" })}
        />
      ) : null}

      {entityDetailDialog.open ? (
        <EntityDetailDialog
          entityType={entityDetailDialog.entityType}
          entityId={entityDetailDialog.entityId}
          onClose={() => setEntityDetailDialog({ open: false, entityType: "", entityId: "" })}
          onSaved={handleEntityDetailSaved}
        />
      ) : null}

      <PendingMessagesIndicator count={pendingMessages.length} onClick={() => setMessagesDialogOpen(true)} />

      {messagesDialogOpen ? (
        <PendingMessagesDialog
          messages={pendingMessages}
          currentIndex={currentMessageIndex}
          responseText={messageResponseText}
          responding={respondingToMessage}
          error={messageResponseError}
          onClose={() => setMessagesDialogOpen(false)}
          onPrevious={() => setCurrentMessageIndex((current) => Math.max(0, current - 1))}
          onNext={() => setCurrentMessageIndex((current) => Math.min(pendingMessages.length - 1, current + 1))}
          onResponseTextChange={setMessageResponseText}
          onRespond={handleRespondToMessage}
          onAttachToSession={handleAttachToSessionMessage}
        />
      ) : null}

      {terminalDialog.open ? (
        <TerminalSessionDialog
          sessionName={terminalDialog.sessionName}
          title={terminalDialog.title}
          onClose={() => setTerminalDialog({ open: false, sessionName: "", title: "" })}
        />
      ) : null}
    </div>
  );
}
