import { useEffect, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  FileText,
  FlaskConical,
  GripVertical,
  Layers3,
  Pencil,
  Play,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";

import {
  fetchProcesses,
  fetchProjectSubprojects,
  fetchProjectTasks,
  fetchTaskTypes,
  reorderProjectTasks,
} from "../api";
import { STATUS_LABELS, STATUS_ORDER, STATUS_TONES } from "../constants";

function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatStatus(status) {
  return STATUS_LABELS[status] || status;
}

function toneClass(status) {
  return `tone-${STATUS_TONES[status] || "neutral"}`;
}

function isFeatureTaskType(taskType) {
  if (!taskType) return false;
  return taskType.key === "feature" || taskType.name === "Feature";
}

function isFeatureTask(task, taskTypes) {
  return isFeatureTaskType(taskTypes.find((taskType) => taskType.id === task.task_type_id));
}

function FeatureTreeNode({
  task,
  depth,
  taskContextMenuId,
  taskContextSubmenuId,
  onToggleTaskContextMenu,
  onToggleTaskContextSubmenu,
  onOpenEntityAssets,
  onEditTask,
  onExecuteTask,
  onChangeTaskStatus,
  onDeleteTask,
  onOpenEntityDetails,
}) {
  return (
    <div className="tree-node tree-node--feature">
      <div className="task-row task-row--feature">
        <button
          type="button"
          className="task-row__main task-row__main--feature"
          onClick={() => onOpenEntityDetails?.("task", task.id)}
          style={{ paddingLeft: `${34 + depth * 20}px` }}
        >
          <span className="process-row__leading">
            <span className="process-row__avatar process-row__avatar--feature">F</span>
            <span className="process-row__body">
              <span className="process-row__title">{task.title}</span>
              <span className="process-row__meta">
                <span className="tree-node__feature-label">Feature</span>
                <span>•</span>
                <span>{formatStatus(task.status)}</span>
              </span>
            </span>
          </span>
        </button>
        <div className="task-row__actions" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="task-row__menu-btn"
            onClick={() => onToggleTaskContextMenu(task.id)}
          >
            <Ellipsis size={14} strokeWidth={2} />
          </button>
          {taskContextMenuId === task.id ? (
            <div className="task-row__popover">
              <button type="button" className="task-menu__item" onClick={() => { onToggleTaskContextMenu(null); onOpenEntityAssets?.("task", task.id, task.title); }}>
                <span className="task-menu__item-icon" aria-hidden="true"><FileText size={12} strokeWidth={2} /></span>
                <span>Notes & Files</span>
              </button>
              <button type="button" className="task-menu__item" onClick={() => { onToggleTaskContextMenu(null); onEditTask?.(task); }}>
                <span className="task-menu__item-icon" aria-hidden="true"><Pencil size={12} strokeWidth={2} /></span>
                <span>Edit</span>
              </button>
              <div className="task-menu__submenu-anchor">
                <button
                  type="button"
                  className="task-menu__item task-menu__item--submenu"
                  onClick={() => onToggleTaskContextSubmenu(taskContextSubmenuId === task.id ? null : task.id)}
                >
                  <span className="task-menu__item-icon" aria-hidden="true">
                    <SlidersHorizontal size={12} strokeWidth={2} />
                  </span>
                  <span>Change State</span>
                  <span className="task-menu__submenu-caret" aria-hidden="true">
                    <ChevronRight size={12} strokeWidth={2} />
                  </span>
                </button>
                {taskContextSubmenuId === task.id ? (
                  <div className="task-menu__submenu task-menu__submenu--left">
                    {STATUS_ORDER.map((status) => (
                      <button
                        key={status}
                        type="button"
                        className="task-menu__item"
                        onClick={async () => {
                          onToggleTaskContextMenu(null);
                          onToggleTaskContextSubmenu(null);
                          await onChangeTaskStatus?.(task, status);
                        }}
                      >
                        <span className="task-menu__item-icon" aria-hidden="true">
                          <span className={`task-menu__status-dot ${toneClass(status)}`} />
                        </span>
                        <span>{formatStatus(status)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button type="button" className="task-menu__item" onClick={() => { onToggleTaskContextMenu(null); onExecuteTask?.(task); }}>
                <span className="task-menu__item-icon" aria-hidden="true"><Play size={12} strokeWidth={2} /></span>
                <span>Execute</span>
              </button>
              <button type="button" className="task-menu__item" onClick={() => { onToggleTaskContextMenu(null); onToggleTaskContextSubmenu(null); onDeleteTask?.(task); }}>
                <span className="task-menu__item-icon" aria-hidden="true"><Trash2 size={12} strokeWidth={2} /></span>
                <span>Delete</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ProjectTreeNode({
  node,
  projects,
  depth,
  expandedIds,
  treeState,
  onToggle,
  onSelect,
  focusedProjectId,
  onCreateSubproject,
  onCreateFeature,
  projectContextMenuId,
  onToggleProjectContextMenu,
  onOpenProjectAssets,
  taskContextMenuId,
  taskContextSubmenuId,
  onToggleTaskContextMenu,
  onToggleTaskContextSubmenu,
  onEditTask,
  onExecuteTask,
  onChangeTaskStatus,
  onDeleteTask,
  onOpenEntityAssets,
  onOpenEntityDetails,
}) {
  const state = treeState[node.id];
  const childNodes = state?.subprojects || [];
  const childCount = projects.filter((project) => project.parent_project_id === node.id).length;
  const isExpanded = expandedIds.includes(node.id);
  const canExpand = state?.loading || childNodes.length > 0 || childCount > 0 || node.hasKnownChildren;
  const isFocused = focusedProjectId === node.id;

  function handleSelectProjectKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(node);
    }
  }

  return (
    <div className="tree-node">
      <div
        className={`process-row process-row--tree${isExpanded ? " process-row--tree-expanded" : ""}${isFocused ? " process-row--focused" : ""}`}
      >
        <div
          className="process-row__main"
          onClick={() => {
            onSelect(node);
          }}
          onKeyDown={handleSelectProjectKeyDown}
          role="button"
          tabIndex={0}
          style={{ paddingLeft: `${16 + depth * 20}px` }}
        >
          <span className="process-row__leading">
            {canExpand ? (
              <button
                type="button"
                className={`tree-node__expand-indicator${isExpanded ? " tree-node__expand-indicator--expanded" : ""}`}
                aria-label={isExpanded ? "Collapse project" : "Expand project"}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle(node);
                }}
              >
                {isExpanded ? <ChevronDown size={14} strokeWidth={2} /> : <ChevronRight size={14} strokeWidth={2} />}
              </button>
            ) : (
              <span className="tree-node__expand-indicator tree-node__expand-indicator--placeholder" aria-hidden="true" />
            )}
            <span className="process-row__avatar">{initials(node.name)}</span>
            <span className="process-row__body">
              <span className="process-row__title">{node.name}</span>
              <span className="process-row__meta">
                <span>{node.slug}</span>
                {childCount > 0 ? (
                  <>
                    <span>•</span>
                    <span className="tree-node__child-count">
                      {childCount} sub-project{childCount === 1 ? "" : "s"}
                    </span>
                  </>
                ) : null}
              </span>
            </span>
          </span>
        </div>
        <div className="task-row__actions">
          <button
            type="button"
            className="row-action-button"
            aria-label="Project menu"
            onClick={() => onToggleProjectContextMenu(node.id)}
          >
            <Ellipsis size={14} strokeWidth={2} />
          </button>
          {projectContextMenuId === node.id ? (
            <div className="tree-node__popover">
              <button type="button" className="task-menu__item" onClick={() => { onToggleProjectContextMenu(node.id); onOpenEntityDetails?.("project", node.id); }}>
                <span className="task-menu__item-icon" aria-hidden="true"><Pencil size={12} strokeWidth={2} /></span>
                <span>Properties</span>
              </button>
              <div className="task-menu__separator" role="separator" />
              <button type="button" className="task-menu__item" onClick={() => { onToggleProjectContextMenu(node.id); onCreateSubproject(node); }}>
                <span className="task-menu__item-icon" aria-hidden="true"><Plus size={12} strokeWidth={2} /></span>
                <span>Create Sub-Project</span>
              </button>
              <button type="button" className="task-menu__item" onClick={() => { onToggleProjectContextMenu(node.id); onCreateFeature(node); }}>
                <span className="task-menu__item-icon" aria-hidden="true"><Layers3 size={12} strokeWidth={2} /></span>
                <span>Create Feature</span>
              </button>
              <div className="task-menu__separator" role="separator" />
              <button type="button" className="task-menu__item" onClick={() => { onToggleProjectContextMenu(node.id); onOpenProjectAssets(node); }}>
                <span className="task-menu__item-icon" aria-hidden="true"><FileText size={12} strokeWidth={2} /></span>
                <span>Notes & Files</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {isExpanded ? (
        state?.loading ? (
          <div className="tree-loading" style={{ paddingLeft: `${56 + depth * 20}px` }}>
            Loading sub-projects and features...
          </div>
        ) : childNodes.length > 0 || (state?.features?.length || 0) > 0 ? (
          <div className="tree-children">
            {childNodes.map((child) => (
              <ProjectTreeNode
                key={child.id}
                node={child}
                projects={projects}
                depth={depth + 1}
                expandedIds={expandedIds}
                treeState={treeState}
                onToggle={onToggle}
                onSelect={onSelect}
                focusedProjectId={focusedProjectId}
                onCreateSubproject={onCreateSubproject}
                onCreateFeature={onCreateFeature}
                projectContextMenuId={projectContextMenuId}
                onToggleProjectContextMenu={onToggleProjectContextMenu}
                onOpenProjectAssets={onOpenProjectAssets}
                taskContextMenuId={taskContextMenuId}
                taskContextSubmenuId={taskContextSubmenuId}
                onToggleTaskContextMenu={onToggleTaskContextMenu}
                onToggleTaskContextSubmenu={onToggleTaskContextSubmenu}
                onEditTask={onEditTask}
                onExecuteTask={onExecuteTask}
                onChangeTaskStatus={onChangeTaskStatus}
                onDeleteTask={onDeleteTask}
                onOpenEntityAssets={onOpenEntityAssets}
                onOpenEntityDetails={onOpenEntityDetails}
              />
            ))}
            {(state?.features || []).map((feature) => (
              <FeatureTreeNode
                key={feature.id}
                task={feature}
                depth={depth + 1}
                taskContextMenuId={taskContextMenuId}
                taskContextSubmenuId={taskContextSubmenuId}
                onToggleTaskContextMenu={onToggleTaskContextMenu}
                onToggleTaskContextSubmenu={onToggleTaskContextSubmenu}
                onOpenEntityAssets={onOpenEntityAssets}
                onEditTask={onEditTask}
                onExecuteTask={onExecuteTask}
                onChangeTaskStatus={onChangeTaskStatus}
                onDeleteTask={onDeleteTask}
                onOpenEntityDetails={onOpenEntityDetails}
              />
            ))}
          </div>
        ) : null
      ) : null}
    </div>
  );
}

export default function ProjectFlowView({
  rootProject,
  focusedProject,
  onFocusProject,
  tasks,
  subprojects,
  projects,
  flowReloadToken,
  onCreateSubproject,
  onCreateFeature,
  taskMenuOpen,
  onToggleTaskMenu,
  onCreateTaskType,
  onEditTask,
  onExecuteTask,
  onChangeTaskStatus,
  onDeleteTask,
  onOpenEntityAssets,
  onOpenEntityDetails,
}) {
  const previousRootProjectIdRef = useRef(null);
  const [expandedIds, setExpandedIds] = useState([]);
  const [treeState, setTreeState] = useState({});
  const [focusedTasks, setFocusedTasks] = useState([]);
  const [taskTypesByProject, setTaskTypesByProject] = useState({});
  const [taskContextMenuId, setTaskContextMenuId] = useState(null);
  const [taskContextSubmenuId, setTaskContextSubmenuId] = useState(null);
  const [projectContextMenuId, setProjectContextMenuId] = useState(null);
  const [activeProcessByTaskId, setActiveProcessByTaskId] = useState({});
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dropTaskId, setDropTaskId] = useState(null);
  const [isPersistingReorder, setIsPersistingReorder] = useState(false);

  const targetProjectId = focusedProject?.id || rootProject?.id;
  const rootTaskTypes = rootProject ? (taskTypesByProject[rootProject.id] || []) : [];
  const currentTaskTypes = targetProjectId ? (taskTypesByProject[targetProjectId] || []) : [];
  const currentProjectTasks = focusedTasks.filter((task) => (targetProjectId ? task.project_id === targetProjectId : false));
  const filteredTasks = currentProjectTasks
    .filter((task) => !isFeatureTask(task, currentTaskTypes));

  useEffect(() => {
    let active = true;

    async function loadActiveProcesses() {
      try {
        const summaries = await fetchProcesses();
        if (!active) return;
        const runningMap = Object.fromEntries(
          (Array.isArray(summaries) ? summaries : [])
            .filter((process) => process.status === "running" && process.task_id && process.id)
            .map((process) => [process.task_id, process.id]),
        );
        setActiveProcessByTaskId(runningMap);
      } catch {
        if (!active) return;
        setActiveProcessByTaskId({});
      }
    }

    loadActiveProcesses();
    const intervalId = window.setInterval(loadActiveProcesses, 5000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [flowReloadToken]);

  useEffect(() => {
    if (!targetProjectId) {
      setFocusedTasks([]);
      return;
    }
    let cancelled = false;

    async function loadProjectTasksAndTypes() {
      try {
        const [projectTasks, taskTypes] = await Promise.all([
          fetchProjectTasks(targetProjectId),
          fetchTaskTypes(targetProjectId),
        ]);
        if (cancelled) return;
        setTaskTypesByProject((current) => ({ ...current, [targetProjectId]: taskTypes }));
        setFocusedTasks(projectTasks);
      } catch {
        if (cancelled) return;
        setTaskTypesByProject((current) => ({ ...current, [targetProjectId]: [] }));
        setFocusedTasks([]);
      }
    }

    loadProjectTasksAndTypes();
    return () => { cancelled = true; };
  }, [targetProjectId, rootProject?.id, flowReloadToken]);

  useEffect(() => {
    if (!rootProject) {
      previousRootProjectIdRef.current = null;
      setExpandedIds([]);
      setTreeState({});
      return;
    }

    let cancelled = false;
    const rootChanged = previousRootProjectIdRef.current !== rootProject.id;
    previousRootProjectIdRef.current = rootProject.id;

    if (rootChanged) {
      setExpandedIds([rootProject.id]);
      setTreeState({});
    } else {
      setExpandedIds((current) => (current.includes(rootProject.id) ? current : [rootProject.id, ...current]));
    }

    async function loadRootTree() {
      try {
        const taskTypes = await fetchTaskTypes(rootProject.id);
        if (cancelled) return;
        setTaskTypesByProject((current) => ({ ...current, [rootProject.id]: taskTypes }));
        setTreeState((current) => ({
          ...current,
          [rootProject.id]: {
            loading: false,
            subprojects: subprojects.map((item) => ({
              ...item,
              hasKnownChildren: true,
            })),
            features: tasks
              .filter((task) => task.project_id === rootProject.id)
              .filter((task) => isFeatureTask(task, taskTypes)),
            error: "",
          },
        }));
      } catch {
        if (cancelled) return;
        setTaskTypesByProject((current) => ({ ...current, [rootProject.id]: [] }));
        setTreeState((current) => ({
          ...current,
          [rootProject.id]: {
            loading: false,
            subprojects: subprojects.map((item) => ({
              ...item,
              hasKnownChildren: true,
            })),
            features: [],
            error: "",
          },
        }));
      }
    }

    loadRootTree();
    return () => { cancelled = true; };
  }, [rootProject, subprojects, tasks, flowReloadToken]);

  useEffect(() => {
    function handlePointerDown(event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(".task-row__actions")
        || target.closest(".task-menu")
        || target.closest(".tree-node__popover")
        || target.closest(".row-action-button")
      ) {
        return;
      }
      setTaskContextMenuId(null);
      setTaskContextSubmenuId(null);
      setProjectContextMenuId(null);
      setDropTaskId(null);
    }

    function handleKeyDown(event) {
      if (event.key !== "Escape") return;
      setTaskContextMenuId(null);
      setTaskContextSubmenuId(null);
      setProjectContextMenuId(null);
      setDropTaskId(null);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  async function toggleSubproject(node) {
    if (node.id === rootProject?.id) {
      setExpandedIds((current) => (current.includes(node.id) ? current : [...current, node.id]));
      return;
    }

    if (expandedIds.includes(node.id)) {
      setExpandedIds((current) => current.filter((id) => id !== node.id));
      return;
    }

    if (treeState[node.id]) {
      if ((treeState[node.id].subprojects?.length || 0) === 0 && (treeState[node.id].features?.length || 0) === 0) {
        return;
      }
      setExpandedIds((current) => [...current, node.id]);
      return;
    }

    setTreeState((current) => ({
      ...current,
      [node.id]: { loading: true, subprojects: [], features: [], error: "" },
    }));

    try {
      const [subprojectData, projectTasks, taskTypes] = await Promise.all([
        fetchProjectSubprojects(node.id),
        fetchProjectTasks(node.id),
        fetchTaskTypes(node.id),
      ]);

      setTreeState((current) => ({
        ...current,
        [node.id]: {
          loading: false,
          subprojects: subprojectData.map((item) => ({
            ...item,
            hasKnownChildren: true,
          })),
          features: projectTasks.filter((task) => isFeatureTask(task, taskTypes)),
          error: "",
        },
      }));
      setTaskTypesByProject((current) => ({ ...current, [node.id]: taskTypes }));
      if (subprojectData.length > 0 || projectTasks.some((task) => isFeatureTask(task, taskTypes))) {
        setExpandedIds((current) => [...current, node.id]);
      }
    } catch (error) {
      setTreeState((current) => ({
        ...current,
        [node.id]: {
          loading: false,
          subprojects: [],
          features: [],
          error: error.message || "Unable to load subproject details.",
        },
      }));
    }
  }

  function moveTaskBefore(taskList, movingTaskId, targetTaskId) {
    if (!movingTaskId || !targetTaskId || movingTaskId === targetTaskId) {
      return taskList;
    }
    const nextTasks = [...taskList];
    const movingIndex = nextTasks.findIndex((task) => task.id === movingTaskId);
    const targetIndex = nextTasks.findIndex((task) => task.id === targetTaskId);
    if (movingIndex === -1 || targetIndex === -1) {
      return taskList;
    }
    const [movingTask] = nextTasks.splice(movingIndex, 1);
    const insertIndex = movingIndex < targetIndex ? targetIndex - 1 : targetIndex;
    nextTasks.splice(insertIndex, 0, movingTask);
    return nextTasks;
  }

  async function handleTaskDrop(targetTaskId) {
    if (!draggedTaskId || !targetProjectId || draggedTaskId === targetTaskId || isPersistingReorder) {
      setDraggedTaskId(null);
      setDropTaskId(null);
      return;
    }

    const reorderedVisibleTasks = moveTaskBefore(filteredTasks, draggedTaskId, targetTaskId);
    if (reorderedVisibleTasks === filteredTasks) {
      setDraggedTaskId(null);
      setDropTaskId(null);
      return;
    }

    const previousTasks = focusedTasks;
    const reorderedTaskIds = reorderedVisibleTasks.map((task) => task.id);
    const reorderedTaskIdSet = new Set(reorderedTaskIds);
    const optimisticTasks = [
      ...reorderedVisibleTasks,
      ...currentProjectTasks.filter((task) => !reorderedTaskIdSet.has(task.id)),
    ];

    setFocusedTasks(optimisticTasks);
    setDraggedTaskId(null);
    setDropTaskId(null);
    setIsPersistingReorder(true);

    try {
      const refreshedTasks = await reorderProjectTasks(targetProjectId, reorderedTaskIds);
      setFocusedTasks(refreshedTasks);
    } catch (error) {
      console.error(error);
      setFocusedTasks(previousTasks);
    } finally {
      setIsPersistingReorder(false);
    }
  }

  return (
    <div className="view-stack">
      <section className="process-columns">
        <section className="panel process-panel">
          <div className="panel__header">
            <div>
              <div className="panel__title">Projects</div>
              <div className="panel__subtitle">{rootProject ? "Subprojects and hierarchy." : "Choose a root project."}</div>
            </div>
          </div>
          <div className="process-list">
            {!rootProject ? (
              <div className="empty-copy empty-copy--inset">No project selected.</div>
            ) : (
              <ProjectTreeNode
                node={{ ...rootProject, hasKnownChildren: subprojects.length > 0 }}
                projects={projects}
                depth={0}
                expandedIds={expandedIds}
                treeState={treeState}
                onToggle={toggleSubproject}
                onSelect={onFocusProject}
                focusedProjectId={focusedProject?.id}
                onCreateSubproject={onCreateSubproject}
                onCreateFeature={onCreateFeature}
                projectContextMenuId={projectContextMenuId}
                onToggleProjectContextMenu={(projectId) => setProjectContextMenuId((current) => current === projectId ? null : projectId)}
                onOpenProjectAssets={(project) => {
                  setProjectContextMenuId(null);
                  onOpenEntityAssets?.("project", project.id, project.name);
                }}
                taskContextMenuId={taskContextMenuId}
                taskContextSubmenuId={taskContextSubmenuId}
                onToggleTaskContextMenu={(taskId) => setTaskContextMenuId((current) => current === taskId ? null : taskId)}
                onToggleTaskContextSubmenu={setTaskContextSubmenuId}
                onEditTask={onEditTask}
                onExecuteTask={onExecuteTask}
                onChangeTaskStatus={onChangeTaskStatus}
                onDeleteTask={onDeleteTask}
                onOpenEntityAssets={onOpenEntityAssets}
                onOpenEntityDetails={onOpenEntityDetails}
              />
            )}
            {rootProject && subprojects.length === 0 && !tasks.some((task) => isFeatureTask(task, rootTaskTypes)) ? (
              <div className="empty-copy empty-copy--inset">No subprojects or features for this project.</div>
            ) : null}
          </div>
        </section>

        <section className="panel process-panel">
          <div className="panel__header">
            <div className="panel__header-row">
              <div>
                <div className="panel__title">{focusedProject?.name || rootProject?.name || "Project"} Tasks</div>
                <div className="panel__subtitle">{filteredTasks.length} task{filteredTasks.length === 1 ? "" : "s"}</div>
              </div>
              <div className="task-menu">
                <button type="button" className="primary-button" onClick={onToggleTaskMenu}>
                  New Task
                </button>
                {taskMenuOpen ? (
                  <div className="task-menu__popover">
                    <button type="button" className="task-menu__item" onClick={() => onCreateTaskType("Work")}>
                      <span className="task-menu__item-icon" aria-hidden="true">
                        <BriefcaseBusiness size={12} strokeWidth={2.1} />
                      </span>
                      <span>Work</span>
                    </button>
                    <button type="button" className="task-menu__item" onClick={() => onCreateTaskType("Research")}>
                      <span className="task-menu__item-icon" aria-hidden="true">
                        <FlaskConical size={12} strokeWidth={2.1} />
                      </span>
                      <span>Research</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div className="task-list">
            {filteredTasks.length === 0 ? (
              <div className="empty-copy empty-copy--inset">No tasks yet.</div>
            ) : (
              filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className={`task-row${draggedTaskId === task.id ? " task-row--dragging" : ""}${dropTaskId === task.id ? " task-row--drop-target" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (draggedTaskId && draggedTaskId !== task.id) {
                      setDropTaskId(task.id);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    void handleTaskDrop(task.id);
                  }}
                >
                  <button
                    type="button"
                    className="task-row__drag-handle"
                    draggable={!isPersistingReorder}
                    aria-label="Reorder task"
                    onDragStart={(event) => {
                      setDraggedTaskId(task.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", task.id);
                    }}
                    onDragEnd={() => {
                      setDraggedTaskId(null);
                      setDropTaskId(null);
                    }}
                  >
                    <GripVertical size={14} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="task-row__main"
                    onClick={() => onOpenEntityDetails?.("task", task.id)}
                  >
                    <div className="task-row__title">{task.title}</div>
                    <span className="task-row__status">
                      <span className={`status-pill ${toneClass(task.status)}`}>
                        {formatStatus(task.status)}
                      </span>
                      {task.status === "in_execution" && activeProcessByTaskId[task.id] ? (
                        <span className="task-row__process-id">{activeProcessByTaskId[task.id]}</span>
                      ) : null}
                    </span>
                  </button>
                  <div className="task-row__actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="task-row__menu-btn"
                      onClick={() => setTaskContextMenuId(taskContextMenuId === task.id ? null : task.id)}
                    >
                      <Ellipsis size={14} strokeWidth={2} />
                    </button>
                    {taskContextMenuId === task.id ? (
                      <div className="task-row__popover">
                        <button type="button" className="task-menu__item" onClick={() => { setTaskContextMenuId(null); setTaskContextSubmenuId(null); onOpenEntityAssets?.("task", task.id, task.title); }}>
                          <span className="task-menu__item-icon" aria-hidden="true"><FileText size={12} strokeWidth={2} /></span>
                          <span>Notes & Files</span>
                        </button>
                        <button type="button" className="task-menu__item" onClick={() => { setTaskContextMenuId(null); onEditTask?.(task); }}>
                          <span className="task-menu__item-icon" aria-hidden="true"><Pencil size={12} strokeWidth={2} /></span>
                          <span>Edit</span>
                        </button>
                        <div className="task-menu__submenu-anchor">
                          <button
                            type="button"
                            className="task-menu__item task-menu__item--submenu"
                            onClick={() => setTaskContextSubmenuId(taskContextSubmenuId === task.id ? null : task.id)}
                          >
                            <span className="task-menu__item-icon" aria-hidden="true">
                              <SlidersHorizontal size={12} strokeWidth={2} />
                            </span>
                            <span>Change State</span>
                            <span className="task-menu__submenu-caret" aria-hidden="true">
                              <ChevronRight size={12} strokeWidth={2} />
                            </span>
                          </button>
                          {taskContextSubmenuId === task.id ? (
                            <div className="task-menu__submenu task-menu__submenu--left">
                              {STATUS_ORDER.map((status) => (
                                <button
                                  key={status}
                                  type="button"
                                  className="task-menu__item"
                                  onClick={async () => {
                                    setTaskContextMenuId(null);
                                    setTaskContextSubmenuId(null);
                                    await onChangeTaskStatus?.(task, status);
                                  }}
                                >
                                  <span className="task-menu__item-icon" aria-hidden="true">
                                    <span className={`task-menu__status-dot ${toneClass(status)}`} />
                                  </span>
                                  <span>{formatStatus(status)}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <button type="button" className="task-menu__item" onClick={() => { setTaskContextMenuId(null); onExecuteTask?.(task); }}>
                          <span className="task-menu__item-icon" aria-hidden="true"><Play size={12} strokeWidth={2} /></span>
                          <span>Execute</span>
                        </button>
                        <button type="button" className="task-menu__item" onClick={() => { setTaskContextMenuId(null); setTaskContextSubmenuId(null); onDeleteTask?.(task); }}>
                          <span className="task-menu__item-icon" aria-hidden="true"><Trash2 size={12} strokeWidth={2} /></span>
                          <span>Delete</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </section>
    </div>
  );
}
