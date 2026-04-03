import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  ChevronDown,
  ChevronRight,
  Ellipsis,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  Save,
} from "lucide-react";

import {
  createSkill,
  fetchAgents,
  fetchAgentModels,
  fetchSkillDefaults,
  fetchSkillDetail,
  fetchSkillFile,
  fetchSkills,
  updateSkillFile,
  upsertSkillDefault,
} from "../api";

const SKILL_EDITOR_LANGUAGES = [
  { id: "markdown", label: "Markdown" },
  { id: "yaml", label: "YAML" },
  { id: "json", label: "JSON" },
  { id: "toml", label: "TOML" },
  { id: "python", label: "Python" },
  { id: "bash", label: "Bash" },
];

const SKILL_LANGUAGE_BY_EXTENSION = {
  md: "markdown",
  markdown: "markdown",
  yml: "yaml",
  yaml: "yaml",
  json: "json",
  toml: "toml",
  py: "python",
  sh: "bash",
  bash: "bash",
};

function fileNameFromPath(path) {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

function fileExtension(path) {
  const fileName = fileNameFromPath(path);
  const match = fileName.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function inferSkillEditorLanguage(path) {
  return SKILL_LANGUAGE_BY_EXTENSION[fileExtension(path)] || "markdown";
}

function buildSkillFileTree(skillName, files) {
  const root = [];
  const folders = new Map();

  function ensureFolder(path, name, depth) {
    if (folders.has(path)) {
      return folders.get(path);
    }

    const folder = {
      id: `folder:${skillName}:${path}`,
      type: "folder",
      name,
      path,
      depth,
      children: [],
    };

    folders.set(path, folder);

    if (!path.includes("/")) {
      root.push(folder);
      return folder;
    }

    const parentPath = path.slice(0, path.lastIndexOf("/"));
    const parentFolder = ensureFolder(parentPath, fileNameFromPath(parentPath), depth - 1);
    parentFolder.children.push(folder);
    return folder;
  }

  for (const filePath of files) {
    const parts = filePath.split("/").filter(Boolean);
    let currentPath = "";

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLeaf = index === parts.length - 1;

      if (!isLeaf) {
        ensureFolder(currentPath, part, index);
        continue;
      }

      const fileNode = {
        id: `file:${skillName}:${filePath}`,
        type: "file",
        name: part,
        path: filePath,
        depth: index,
        extension: fileExtension(filePath),
      };

      if (parts.length === 1) {
        root.push(fileNode);
      } else {
        const parentPath = currentPath.slice(0, currentPath.lastIndexOf("/"));
        const parentFolder = ensureFolder(parentPath, fileNameFromPath(parentPath), index - 1);
        parentFolder.children.push(fileNode);
      }
    }
  }

  function sortNodes(nodes) {
    nodes.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === "folder" ? -1 : 1;
      }
      if (left.type === "file" && right.type === "file") {
        if (left.name.toLowerCase() === "skill.md") return -1;
        if (right.name.toLowerCase() === "skill.md") return 1;
      }
      return left.name.localeCompare(right.name);
    });

    nodes.forEach((node) => {
      if (node.type === "folder") {
        sortNodes(node.children);
      }
    });

    return nodes;
  }

  return sortNodes(root);
}

function toMonacoLanguage(languageId) {
  switch (languageId) {
    case "markdown":
      return "markdown";
    case "yaml":
      return "yaml";
    case "json":
      return "json";
    case "python":
      return "python";
    case "bash":
      return "shell";
    case "toml":
      return "plaintext";
    default:
      return "plaintext";
  }
}

function SkillTreeNode({ node, skillName, expandedFolders, onToggleFolder, selectedNodeId, onSelectNode }) {
  const isFolder = node.type === "folder";
  const isExpanded = isFolder ? expandedFolders[node.id] !== false : false;
  const isSelected = selectedNodeId === node.id;

  return (
    <div className="skill-tree__branch">
      <button
        type="button"
        className={`skill-tree__node skill-tree__node--${node.type}${isSelected ? " skill-tree__node--selected" : ""}`}
        onClick={() => {
          if (isFolder) {
            onToggleFolder(node.id);
            onSelectNode({ type: "folder", id: node.id, skillName, path: node.path });
            return;
          }
          onSelectNode({ type: "file", id: node.id, skillName, path: node.path });
        }}
        style={{ "--skill-depth": node.depth }}
      >
        <span className="skill-tree__node-icon" aria-hidden="true">
          {isFolder ? (
            isExpanded ? (
              <>
                <ChevronDown size={12} strokeWidth={2.1} />
                <FolderOpen size={13} strokeWidth={2.1} />
              </>
            ) : (
              <>
                <ChevronRight size={12} strokeWidth={2.1} />
                <Folder size={13} strokeWidth={2.1} />
              </>
            )
          ) : node.extension === "md" ? (
            <FileText size={13} strokeWidth={2.1} />
          ) : (
            <FileCode2 size={13} strokeWidth={2.1} />
          )}
        </span>
        <span className="skill-tree__node-label">{node.name}</span>
      </button>

      {isFolder && isExpanded && node.children?.length ? (
        <div className="skill-tree__children">
          {node.children.map((child) => (
            <SkillTreeNode
              key={child.id}
              node={child}
              skillName={skillName}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function SkillsConfigScreen({ theme = "light" }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [skillForm, setSkillForm] = useState({ name: "", createScriptsFolder: false });
  const [skills, setSkills] = useState([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillsError, setSkillsError] = useState("");
  const [agents, setAgents] = useState([]);
  const [agentModelsMap, setAgentModelsMap] = useState({});
  const [skillDefaults, setSkillDefaults] = useState({});
  const [expandedSkills, setExpandedSkills] = useState({});
  const [expandedFolders, setExpandedFolders] = useState({});
  const [selectedSkillNodeId, setSelectedSkillNodeId] = useState("");
  const [selectedSkillFile, setSelectedSkillFile] = useState(null);
  const [skillFileLoading, setSkillFileLoading] = useState(false);
  const [skillFileError, setSkillFileError] = useState("");
  const [lastSavedEditorCode, setLastSavedEditorCode] = useState("");
  const [saveState, setSaveState] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const [editorLanguage, setEditorLanguage] = useState("markdown");
  const [editorCode, setEditorCode] = useState(["# Skills Config", "", "# Create a skill to get started.", "# The editor will adapt to the language you pick."].join("\n"));
  const [defaultsDialogSkill, setDefaultsDialogSkill] = useState(null);

  const editorLanguageConfig =
    SKILL_EDITOR_LANGUAGES.find((language) => language.id === editorLanguage) || SKILL_EDITOR_LANGUAGES[0];

  useEffect(() => {
    let active = true;

    async function loadSkills() {
      try {
        setSkillsLoading(true);
        const summaries = await fetchSkills();
        const details = await Promise.all(
          summaries.map(async (summary) => {
            const detail = await fetchSkillDetail(summary.name);
            return {
              ...detail.meta,
              files: detail.files || [],
            };
          }),
        );

        if (!active) return;

        setSkills(
          details.map((skill) => ({
            ...skill,
            tree: buildSkillFileTree(skill.name, skill.files),
          })),
        );
        setSkillsError("");
      } catch (error) {
        if (!active) return;
        setSkillsError(error.message || "Unable to load skills.");
      } finally {
        if (active) {
          setSkillsLoading(false);
        }
      }
    }

    loadSkills();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    Promise.all([fetchAgents(), fetchSkillDefaults()])
      .then(([agentData, defaultsData]) => {
        const enabled = agentData.filter((a) => a.is_enabled);
        setAgents(enabled);
        enabled.forEach((agent) => {
          fetchAgentModels(agent.id).then((models) => {
            setAgentModelsMap((prev) => ({ ...prev, [agent.key]: models.filter((m) => m.is_enabled === 1) }));
          });
        });
        const map = {};
        defaultsData.forEach((d) => {
          map[d.skill_name] = { default_agent_key: d.default_agent_key, default_model_id: d.default_model_id };
        });
        setSkillDefaults(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!skills.length) return;

    setExpandedSkills((current) => {
      const next = { ...current };
      let changed = false;
      for (const skill of skills) {
        const key = `skill:${skill.name}`;
        if (!(key in next)) {
          next[key] = false;
          changed = true;
        }
      }
      return changed ? next : current;
    });

    setSelectedSkillNodeId((current) => current || `skill:${skills[0].name}`);
  }, [skills]);

  useEffect(() => {
    let active = true;

    async function loadSkillFile() {
      if (!selectedSkillFile?.skillName || !selectedSkillFile?.path) {
        setSkillFileLoading(false);
        setSkillFileError("");
        return;
      }

      try {
        setSkillFileLoading(true);
        const result = await fetchSkillFile(selectedSkillFile.skillName, selectedSkillFile.path);
        if (!active) return;
        setEditorCode(result.content || "");
        setLastSavedEditorCode(result.content || "");
        setEditorLanguage(inferSkillEditorLanguage(selectedSkillFile.path));
        setSkillFileError("");
        setSaveError("");
        setSaveState("idle");
      } catch (error) {
        if (!active) return;
        setSkillFileError(error.message || "Unable to load file.");
      } finally {
        if (active) {
          setSkillFileLoading(false);
        }
      }
    }

    loadSkillFile();

    return () => {
      active = false;
    };
  }, [selectedSkillFile]);

  async function handleDefaultChange(skillName, field, value) {
    const current = skillDefaults[skillName] || {};
    const updated = { ...current, [field]: value };
    if (field === "default_agent_key" && value !== current.default_agent_key) {
      const models = agentModelsMap[value] || [];
      const def = models.find((m) => m.is_default === 1);
      updated.default_model_id = def ? def.model_id : models[0]?.model_id || null;
    }
    setSkillDefaults((prev) => ({ ...prev, [skillName]: updated }));
    try {
      await upsertSkillDefault(skillName, updated);
    } catch {
      // revert on failure
    }
  }

  async function saveSelectedSkillFile(content) {
    if (!selectedSkillFile?.skillName || !selectedSkillFile?.path) return;

    setSaveState("saving");
    setSaveError("");

    try {
      await updateSkillFile(selectedSkillFile.skillName, selectedSkillFile.path, content);
      setLastSavedEditorCode(content);
      setSaveState("saved");
    } catch (error) {
      setSaveError(error.message || "Unable to save file.");
      setSaveState("error");
    }
  }

  function handleChange(event) {
    const { name, value, checked, type } = event.target;
    setSkillForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function handleCreateSkill(event) {
    event.preventDefault();
    const name = skillForm.name.trim();
    if (!name) return;

    try {
      const created = await createSkill({
        name,
        create_scripts_folder: skillForm.createScriptsFolder,
      });
      const summaries = await fetchSkills();
      const details = await Promise.all(
        summaries.map(async (summary) => {
          const detail = await fetchSkillDetail(summary.name);
          return {
            ...detail.meta,
            files: detail.files || [],
          };
        }),
      );
      setSkills(
        details.map((skill) => ({
          ...skill,
          tree: buildSkillFileTree(skill.name, skill.files),
        })),
      );
      setDialogOpen(false);
      setSkillForm({ name: "", createScriptsFolder: false });
      setExpandedSkills((current) => ({ ...current, [`skill:${created.meta.name}`]: true }));
      setSelectedSkillNodeId(`skill:${created.meta.name}`);
    } catch (error) {
      setSkillsError(error.message || "Unable to create skill.");
    }
  }

  function toggleSkill(name) {
    const key = `skill:${name}`;
    setExpandedSkills((current) => ({
      ...current,
      [key]: current[key] === false,
    }));
    setSelectedSkillNodeId(key);
  }

  function toggleFolder(folderId) {
    setExpandedFolders((current) => ({
      ...current,
      [folderId]: current[folderId] === false,
    }));
  }

  function handleSkillNodeSelect(selection) {
    setSelectedSkillNodeId(selection.id);
    if (selection.type === "file") {
      setSelectedSkillFile({ skillName: selection.skillName, path: selection.path });
      return;
    }
    setSelectedSkillFile(null);
    setSkillFileError("");
    setSaveError("");
    setSaveState("idle");
  }

  const hasUnsavedChanges = Boolean(selectedSkillFile) && editorCode !== lastSavedEditorCode;
  return (
    <>
      <section className="skills-config">
        <aside className="panel skills-config__list">
          <div className="skills-config__list-toolbar">
            <button type="button" className="primary-button" onClick={() => setDialogOpen(true)}>
              New Skill
            </button>
          </div>
          {skillsLoading ? (
            <div className="skills-config__empty">
              <div className="skills-config__empty-title">Loading skills...</div>
            </div>
          ) : skillsError ? (
            <div className="skills-config__empty">
              <div className="skills-config__empty-title">Unable to load skills.</div>
              <p className="skills-config__empty-copy">{skillsError}</p>
            </div>
          ) : skills.length ? (
            <div className="skill-tree">
              {skills.map((skill) => {
                const skillKey = `skill:${skill.name}`;
                const expanded = expandedSkills[skillKey] !== false;
                const selected = selectedSkillNodeId === skillKey;

                return (
                  <div className="skill-tree__skill" key={skill.name}>
                    <div className="skill-tree__skill-row">
                      <button
                        type="button"
                        className={`skill-tree__skill-root${selected ? " skill-tree__skill-root--selected" : ""}`}
                        onClick={() => toggleSkill(skill.name)}
                      >
                        <span className="skill-tree__node-icon" aria-hidden="true">
                          {expanded ? <ChevronDown size={12} strokeWidth={2.1} /> : <ChevronRight size={12} strokeWidth={2.1} />}
                          {expanded ? <FolderOpen size={13} strokeWidth={2.1} /> : <Folder size={13} strokeWidth={2.1} />}
                        </span>
                        <span className="skill-tree__skill-body">
                          <span className="skill-tree__skill-name">{skill.name}</span>
                          {skillDefaults[skill.name] ? (
                            <span className="skill-tree__skill-default">
                              {skillDefaults[skill.name].default_agent_key || "—"} / {skillDefaults[skill.name].default_model_id || "—"}
                            </span>
                          ) : null}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="icon-button skill-tree__menu-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDefaultsDialogSkill(skill.name);
                        }}
                        aria-label="Skill settings"
                      >
                        <Ellipsis size={14} strokeWidth={2} />
                      </button>
                    </div>

                    {expanded ? (
                      <div className="skill-tree__children">
                        {skill.tree.map((node) => (
                          <SkillTreeNode
                            key={node.id}
                            node={node}
                            skillName={skill.name}
                            expandedFolders={expandedFolders}
                            onToggleFolder={toggleFolder}
                            selectedNodeId={selectedSkillNodeId}
                            onSelectNode={handleSkillNodeSelect}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="skills-config__empty">
              <div className="skills-config__empty-title">No skills configured yet.</div>
              <p className="skills-config__empty-copy">
                Start by creating a skill, then wire its prompts, scripts, and runtime behavior in the editor.
              </p>
            </div>
          )}
        </aside>

        <section className="panel skills-config__editor">
          <div className="skills-editor__toolbar">
            <span className="skills-editor__title">
              {selectedSkillFile ? `${selectedSkillFile.skillName}/${selectedSkillFile.path}` : "Editor"}
            </span>
            <div className="skills-editor__controls">
              <label className="skills-editor__language">
                <span className="skills-editor__language-value">{editorLanguageConfig.label}</span>
              </label>
              <span className="skills-editor__status">
                {saveState === "saving"
                  ? "Saving..."
                  : saveState === "error"
                    ? "Save failed"
                    : saveState === "saved" && !hasUnsavedChanges
                      ? "Saved"
                      : hasUnsavedChanges
                        ? "Unsaved"
                        : ""}
              </span>
              <button
                type="button"
                className="icon-button"
                onClick={() => saveSelectedSkillFile(editorCode)}
                aria-label="Save file"
                disabled={!selectedSkillFile || skillFileLoading || !hasUnsavedChanges || saveState === "saving"}
              >
                <Save size={12} strokeWidth={2.1} />
              </button>
            </div>
          </div>
          <div className="skills-editor__surface">
            {selectedSkillFile ? (
              skillFileLoading ? (
                <div className="skills-config__empty">
                  <div className="skills-config__empty-title">Loading file...</div>
                </div>
              ) : skillFileError ? (
                <div className="skills-config__empty">
                  <div className="skills-config__empty-title">Unable to load file.</div>
                  <p className="skills-config__empty-copy">{skillFileError}</p>
                </div>
              ) : saveError ? (
                <div className="skills-config__empty">
                  <div className="skills-config__empty-title">Unable to save file.</div>
                  <p className="skills-config__empty-copy">{saveError}</p>
                </div>
              ) : (
                <Editor
                  value={editorCode}
                  onChange={setEditorCode}
                  language={toMonacoLanguage(editorLanguage)}
                  theme={theme === "dark" ? "vs-dark" : "vs"}
                  onMount={(editor, monaco) => {
                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                      if (!selectedSkillFile || skillFileLoading || !hasUnsavedChanges || saveState === "saving") return;
                      void saveSelectedSkillFile(editor.getValue());
                    });
                  }}
                  options={{
                    automaticLayout: true,
                    minimap: { enabled: false },
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    lineHeight: 20,
                    wordWrap: "on",
                    scrollBeyondLastLine: false,
                    renderLineHighlight: "all",
                  }}
                  className="skills-editor__code"
                />
              )
            ) : (
              <div className="skills-config__empty">
                <div className="skills-config__empty-title">Select a file.</div>
                <p className="skills-config__empty-copy">
                  Choose a file from the skill tree to render it in the editor.
                </p>
              </div>
            )}
          </div>
        </section>
      </section>

      {dialogOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setDialogOpen(false)}>
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="skill-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel__header">
              <div className="panel__title" id="skill-dialog-title">
                New Skill
              </div>
            </div>

            <form className="modal-form" onSubmit={handleCreateSkill}>
              <label className="field">
                <span className="field__label">Skill Name</span>
                <input
                  className="field__input"
                  name="name"
                  value={skillForm.name}
                  onChange={handleChange}
                  placeholder="Planner"
                  autoFocus
                />
              </label>

              <label className="checkbox-field">
                <input
                  type="checkbox"
                  name="createScriptsFolder"
                  checked={skillForm.createScriptsFolder}
                  onChange={handleChange}
                />
                <span>Create a scripts folder</span>
              </label>

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setDialogOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  Create Skill
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {defaultsDialogSkill ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setDefaultsDialogSkill(null)}>
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="skill-defaults-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel__header">
              <div className="panel__title" id="skill-defaults-dialog-title">
                {defaultsDialogSkill}
              </div>
              <div className="panel__subtitle">Default agent and model for this skill.</div>
            </div>
            <div className="modal-form">
              <label className="field">
                <span className="field__label">Default Agent</span>
                <select
                  className="field__input"
                  value={skillDefaults[defaultsDialogSkill]?.default_agent_key || "claude"}
                  onChange={(e) => handleDefaultChange(defaultsDialogSkill, "default_agent_key", e.target.value)}
                >
                  {agents.map((a) => (
                    <option key={a.key} value={a.key}>{a.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Default Model</span>
                <select
                  className="field__input"
                  value={skillDefaults[defaultsDialogSkill]?.default_model_id || "claude-sonnet-4-6"}
                  onChange={(e) => handleDefaultChange(defaultsDialogSkill, "default_model_id", e.target.value)}
                >
                  {(agentModelsMap[skillDefaults[defaultsDialogSkill]?.default_agent_key || "claude"] || []).map((m) => (
                    <option key={m.model_id} value={m.model_id}>{m.label || m.model_id}</option>
                  ))}
                </select>
              </label>
              <div className="modal-actions">
                <button type="button" className="primary-button" onClick={() => setDefaultsDialogSkill(null)}>
                  Done
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
