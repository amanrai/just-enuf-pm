import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { FileCode2, Save, Trash2 } from "lucide-react";

import { createHook, deleteHook, fetchHookDetail, fetchHooks, updateHook } from "../api";

function normalizeHookAssetDraft(detail) {
  return {
    name: detail?.name || "",
    content: detail?.content || "",
  };
}

export default function HookScriptsConfigScreen({ theme = "light" }) {
  const [hookAssets, setHookAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedHookAssetName, setSelectedHookAssetName] = useState("");
  const [hookDraft, setHookDraft] = useState({ name: "", content: "" });
  const [hookDraftOriginal, setHookDraftOriginal] = useState("");
  const [editorCode, setEditorCode] = useState("");
  const [lastSavedEditorCode, setLastSavedEditorCode] = useState("");
  const [hookAssetLoading, setHookAssetLoading] = useState(false);
  const [hookAssetSaving, setHookAssetSaving] = useState(false);
  const [hookAssetDeleting, setHookAssetDeleting] = useState(false);
  const [hookAssetError, setHookAssetError] = useState("");

  const hookDraftIsNew = selectedHookAssetName === "__new__";
  const hookDraftDirty =
    hookDraft.name.trim() !== JSON.parse(hookDraftOriginal || "{\"name\":\"\"}").name
    || editorCode !== lastSavedEditorCode;

  async function reloadHookAssets(preferredName) {
    const hooks = await fetchHooks();
    setHookAssets(hooks);
    setSelectedHookAssetName(preferredName || hooks[0]?.name || "__new__");
  }

  useEffect(() => {
    let active = true;

    async function loadHooks() {
      try {
        setLoading(true);
        const hooks = await fetchHooks();
        if (!active) return;
        setHookAssets(hooks);
        setSelectedHookAssetName(hooks[0]?.name || "__new__");
        setError("");
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || "Unable to load hook scripts.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadHooks();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadHookDetail() {
      if (!selectedHookAssetName) return;
      if (selectedHookAssetName === "__new__") {
        const draft = { name: "", content: "" };
        setHookDraft(draft);
        setHookDraftOriginal(JSON.stringify(draft));
        setEditorCode("");
        setLastSavedEditorCode("");
        setHookAssetError("");
        return;
      }

      try {
        setHookAssetLoading(true);
        const detail = await fetchHookDetail(selectedHookAssetName);
        if (!active) return;
        const draft = normalizeHookAssetDraft(detail);
        setHookDraft(draft);
        setHookDraftOriginal(JSON.stringify(draft));
        setEditorCode(draft.content || "");
        setLastSavedEditorCode(draft.content || "");
        setHookAssetError("");
      } catch (loadError) {
        if (!active) return;
        setHookAssetError(loadError.message || "Unable to load hook script.");
      } finally {
        if (active) setHookAssetLoading(false);
      }
    }

    loadHookDetail();
    return () => {
      active = false;
    };
  }, [selectedHookAssetName]);

  async function handleSaveHookAsset() {
    const name = hookDraft.name.trim();
    if (!name) {
      setHookAssetError("Script name is required.");
      return;
    }

    setHookAssetSaving(true);
    setHookAssetError("");
    try {
      if (hookDraftIsNew) {
        await createHook({ name, content: editorCode });
      } else {
        await updateHook(selectedHookAssetName, { content: editorCode });
      }
      await reloadHookAssets(name);
    } catch (saveHookError) {
      setHookAssetError(saveHookError.message || "Unable to save hook script.");
    } finally {
      setHookAssetSaving(false);
    }
  }

  async function handleDeleteHookAsset() {
    if (!selectedHookAssetName || hookDraftIsNew) return;
    setHookAssetDeleting(true);
    setHookAssetError("");
    try {
      await deleteHook(selectedHookAssetName);
      await reloadHookAssets();
    } catch (deleteHookError) {
      setHookAssetError(deleteHookError.message || "Unable to delete hook script.");
    } finally {
      setHookAssetDeleting(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      if (hookAssetSaving || hookAssetDeleting || !hookDraft.name.trim() || !hookDraftDirty) return;
      event.preventDefault();
      handleSaveHookAsset();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hookAssetDeleting, hookAssetSaving, hookDraft.name, hookDraftDirty, hookDraft.content, selectedHookAssetName]);

  return (
    <section className="skills-config">
      <aside className="panel skills-config__list">
        <div className="skills-config__list-toolbar">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setSelectedHookAssetName("__new__");
              const draft = { name: "", content: "" };
              setHookDraft(draft);
              setHookDraftOriginal(JSON.stringify(draft));
              setEditorCode("");
              setLastSavedEditorCode("");
              setHookAssetError("");
            }}
          >
            New Script
          </button>
        </div>

        {loading ? (
          <div className="skills-config__empty">
            <div className="skills-config__empty-title">Loading hook scripts...</div>
          </div>
        ) : error ? (
          <div className="skills-config__empty">
            <div className="skills-config__empty-title">Unable to load hook scripts.</div>
            <p className="skills-config__empty-copy">{error}</p>
          </div>
        ) : hookAssets.length ? (
          <div className="orchestrator-list">
            {hookAssets.map((hook) => (
              <button
                key={hook.name}
                type="button"
                className={`orchestrator-list__item${selectedHookAssetName === hook.name ? " orchestrator-list__item--selected" : ""}`}
                onClick={() => setSelectedHookAssetName(hook.name)}
              >
                <span className="orchestrator-list__item-icon" aria-hidden="true">
                  <FileCode2 size={13} strokeWidth={2.1} />
                </span>
                <span className="orchestrator-list__item-copy">
                  <span className="orchestrator-list__item-name">{hook.name}</span>
                  <span className="orchestrator-list__item-description">Python hook asset</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="skills-config__empty">
            <div className="skills-config__empty-title">No hook scripts yet.</div>
            <p className="skills-config__empty-copy">Create the first reusable hook asset.</p>
          </div>
        )}
      </aside>

      <section className="panel skills-config__editor">
        <div className="skills-editor__toolbar">
          <span className="skills-editor__title">{hookDraftIsNew ? "New Hook Script" : hookDraft.name ? `${hookDraft.name}.py` : "Hook Script"}</span>
          <div className="skills-editor__controls">
            <span className="skills-editor__status">
              {hookAssetSaving ? "Saving..." : hookDraftDirty ? "Unsaved" : !hookDraftIsNew && hookDraft.name ? "Saved" : ""}
            </span>
            {!hookDraftIsNew ? (
              <button
                type="button"
                className="icon-button"
                onClick={handleDeleteHookAsset}
                aria-label="Delete script"
                disabled={hookAssetDeleting || hookAssetSaving}
              >
                <Trash2 size={12} strokeWidth={2.1} />
              </button>
            ) : null}
            <button
              type="button"
              className="icon-button"
              onClick={handleSaveHookAsset}
              aria-label="Save script"
              disabled={hookAssetSaving || hookAssetDeleting || !hookDraft.name.trim() || !hookDraftDirty}
            >
              <Save size={12} strokeWidth={2.1} />
            </button>
          </div>
        </div>

        <div className="skills-editor__surface">
          {hookAssetLoading ? (
            <div className="skills-config__empty">
              <div className="skills-config__empty-title">Loading script...</div>
            </div>
          ) : (
            <>
              <Editor
                key={selectedHookAssetName || "__new__"}
                path={`${hookDraft.name || "hook"}.py`}
                height="100%"
                value={editorCode}
                onChange={(value) => setEditorCode(value || "")}
                language="python"
                theme={theme === "dark" ? "vs-dark" : "vs"}
                onMount={(editor, monaco) => {
                  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                    if (hookAssetSaving || hookAssetDeleting || !hookDraft.name.trim() || !hookDraftDirty) return;
                    void handleSaveHookAsset();
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
            </>
          )}
          {hookAssetError ? <div className="banner banner--error">{hookAssetError}</div> : null}
        </div>
      </section>
    </section>
  );
}
