import { useEffect, useState } from "react";
import { SunMoon } from "lucide-react";
import { SiAnthropic, SiGit, SiGoogle, SiOpenai } from "react-icons/si";

import { deleteNamedSecret, fetchSecrets, fetchSecretsStatus, getNamesOfSecretsByType, lockSecrets, unlockSecrets, upsertNamedSecret } from "../api";

const IDENTITY_PROVIDER_OPTIONS = [
  { label: "Git", icon: SiGit, disabled: false },
  { label: "Anthropic", icon: SiAnthropic, disabled: true },
  { label: "OpenAI", icon: SiOpenai, disabled: true },
  { label: "Google", icon: SiGoogle, disabled: true },
];

const GIT_PROVIDER_DEFAULT_URLS = {
  github: "https://github.com",
  gitlab: "https://gitlab.com",
  "self-hosted": "",
};
const GIT_IDENTITY_SECRET_TYPE = "git_identity";
const ENVIRONMENT_VARIABLE_SECRET_TYPE = "environment_variable";
function clampDurationPart(value, min, max) {
  if (value === "") return "";
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return String(min);
  return String(Math.min(max, Math.max(min, numeric)));
}

function durationPartsToSeconds(parts) {
  const years = Number.parseInt(parts.years, 10) || 0;
  const days = Number.parseInt(parts.days, 10) || 0;
  const hours = Number.parseInt(parts.hours, 10) || 0;
  const minutes = Number.parseInt(parts.minutes, 10) || 0;
  return (years * 365 * 24 * 60 * 60) + (days * 24 * 60 * 60) + (hours * 60 * 60) + (minutes * 60);
}

function formatCountdown(targetIso, nowMs) {
  if (!targetIso) return "—";
  const targetMs = Date.parse(targetIso);
  if (Number.isNaN(targetMs)) return "—";

  let remainingSeconds = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  const years = Math.floor(remainingSeconds / (365 * 24 * 60 * 60));
  remainingSeconds -= years * 365 * 24 * 60 * 60;
  const days = Math.floor(remainingSeconds / (24 * 60 * 60));
  remainingSeconds -= days * 24 * 60 * 60;
  const hours = Math.floor(remainingSeconds / (60 * 60));
  remainingSeconds -= hours * 60 * 60;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds - minutes * 60;
  const parts = [
    years > 0 ? `${years}y` : null,
    days > 0 ? `${days}d` : null,
    hours > 0 ? `${hours}h` : null,
    minutes > 0 ? `${minutes}m` : null,
    seconds > 0 ? `${seconds}s` : null,
  ].filter(Boolean);

  return parts.length ? parts.join(" ") : "0s";
}

export default function SecretsConfigScreen({ theme, onToggleTheme }) {
  const [section, setSection] = useState("general-settings");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [identities, setIdentities] = useState([]);
  const [loadingIdentities, setLoadingIdentities] = useState(false);
  const [environmentVariables, setEnvironmentVariables] = useState([]);
  const [loadingEnvironmentVariables, setLoadingEnvironmentVariables] = useState(false);
  const [secretsStatus, setSecretsStatus] = useState(null);
  const [identityTypeDialogOpen, setIdentityTypeDialogOpen] = useState(false);
  const [gitIdentityDialogOpen, setGitIdentityDialogOpen] = useState(false);
  const [gitIdentityProvider, setGitIdentityProvider] = useState("github");
  const [gitIdentityForm, setGitIdentityForm] = useState({ name: "", url: "", username: "", gitUserName: "", gitUserEmail: "", accessToken: "" });
  const [editingIdentityName, setEditingIdentityName] = useState("");
  const [gitIdentityPassphraseDialogOpen, setGitIdentityPassphraseDialogOpen] = useState(false);
  const [gitIdentityPassphraseAction, setGitIdentityPassphraseAction] = useState("save");
  const [gitIdentityPassphrase, setGitIdentityPassphrase] = useState("");
  const [savingGitIdentity, setSavingGitIdentity] = useState(false);
  const [deletingGitIdentity, setDeletingGitIdentity] = useState(false);
  const [environmentVariableDialogOpen, setEnvironmentVariableDialogOpen] = useState(false);
  const [environmentVariableForm, setEnvironmentVariableForm] = useState({ key: "", value: "" });
  const [editingEnvironmentVariableName, setEditingEnvironmentVariableName] = useState("");
  const [environmentVariablePassphraseDialogOpen, setEnvironmentVariablePassphraseDialogOpen] = useState(false);
  const [environmentVariablePassphraseAction, setEnvironmentVariablePassphraseAction] = useState("save");
  const [environmentVariablePassphrase, setEnvironmentVariablePassphrase] = useState("");
  const [savingEnvironmentVariable, setSavingEnvironmentVariable] = useState(false);
  const [deletingEnvironmentVariable, setDeletingEnvironmentVariable] = useState(false);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [unlockPassphrase, setUnlockPassphrase] = useState("");
  const [unlockDuration, setUnlockDuration] = useState({ years: "0", days: "0", hours: "23", minutes: "59" });
  const [unlockingVault, setUnlockingVault] = useState(false);
  const [lockingVault, setLockingVault] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [unlockTargetType, setUnlockTargetType] = useState("vault");
  const [pendingIdentityName, setPendingIdentityName] = useState("");
  const [pendingEnvironmentVariableName, setPendingEnvironmentVariableName] = useState("");

  useEffect(() => {
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSecretsStatus() {
      try {
        const status = await fetchSecretsStatus();
        if (!active) return;
        setSecretsStatus(status);
      } catch {
        if (!active) return;
        setSecretsStatus(null);
      }
    }

    loadSecretsStatus();
    const intervalId = window.setInterval(loadSecretsStatus, 5000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (section !== "identities") return;
    let active = true;

    async function loadIdentities() {
      setLoadingIdentities(true);
      try {
        const response = await getNamesOfSecretsByType(GIT_IDENTITY_SECRET_TYPE);
        if (!active) return;
        const nextNames = Array.isArray(response?.names) ? response.names : [];
        setIdentities(nextNames);
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || "Unable to load identities.");
      } finally {
        if (active) {
          setLoadingIdentities(false);
        }
      }
    }

    loadIdentities();
    return () => {
      active = false;
    };
  }, [section]);

  useEffect(() => {
    if (section !== "environment-variables") return;
    let active = true;

    async function loadEnvironmentVariables() {
      setLoadingEnvironmentVariables(true);
      try {
        const response = await getNamesOfSecretsByType(ENVIRONMENT_VARIABLE_SECRET_TYPE);
        if (!active) return;
        const nextNames = Array.isArray(response?.names) ? response.names : [];
        setEnvironmentVariables(nextNames);
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || "Unable to load environment variables.");
      } finally {
        if (active) {
          setLoadingEnvironmentVariables(false);
        }
      }
    }

    loadEnvironmentVariables();
    return () => {
      active = false;
    };
  }, [section]);

  async function handleConfirmGitIdentitySave() {
    setSavingGitIdentity(true);
    setError("");
    try {
      await upsertNamedSecret({
        name: gitIdentityForm.name.trim(),
        user_defined_type: GIT_IDENTITY_SECRET_TYPE,
        passphrase: gitIdentityPassphrase,
        value: {
          name: gitIdentityForm.name.trim(),
          provider: gitIdentityProvider,
          url: gitIdentityForm.url.trim(),
          username: gitIdentityForm.username.trim(),
          git_user_name: gitIdentityForm.gitUserName.trim(),
          git_user_email: gitIdentityForm.gitUserEmail.trim(),
          access_token: gitIdentityForm.accessToken,
        },
      });
      setGitIdentityPassphraseDialogOpen(false);
      setGitIdentityPassphrase("");
      setGitIdentityDialogOpen(false);
      setEditingIdentityName("");
      setGitIdentityForm({ name: "", url: GIT_PROVIDER_DEFAULT_URLS.github, username: "", gitUserName: "", gitUserEmail: "", accessToken: "" });
      setIdentities((current) => {
        const next = current.includes(gitIdentityForm.name.trim()) ? current : [...current, gitIdentityForm.name.trim()].sort();
        return next;
      });
      try {
        const status = await fetchSecretsStatus();
        setSecretsStatus(status);
      } catch {
        // keep existing status if refresh fails
      }
    } catch (saveError) {
      setError(saveError.message || "Unable to save Git identity.");
    } finally {
      setSavingGitIdentity(false);
    }
  }

  async function handleConfirmGitIdentityDelete() {
    if (!editingIdentityName) return;
    setDeletingGitIdentity(true);
    setError("");
    try {
      await deleteNamedSecret({
        name: editingIdentityName,
        user_defined_type: GIT_IDENTITY_SECRET_TYPE,
        passphrase: gitIdentityPassphrase,
      });
      setGitIdentityPassphraseDialogOpen(false);
      setGitIdentityPassphrase("");
      setGitIdentityPassphraseAction("save");
      setGitIdentityDialogOpen(false);
      setIdentities((current) => current.filter((name) => name !== editingIdentityName));
      setEditingIdentityName("");
      setGitIdentityForm({ name: "", url: GIT_PROVIDER_DEFAULT_URLS.github, username: "", gitUserName: "", gitUserEmail: "", accessToken: "" });
      try {
        const status = await fetchSecretsStatus();
        setSecretsStatus(status);
      } catch {
        // keep existing status if refresh fails
      }
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete Git identity.");
    } finally {
      setDeletingGitIdentity(false);
    }
  }

  async function handleConfirmEnvironmentVariableSave() {
    setSavingEnvironmentVariable(true);
    setError("");
    try {
      await upsertNamedSecret({
        name: environmentVariableForm.key.trim(),
        user_defined_type: ENVIRONMENT_VARIABLE_SECRET_TYPE,
        passphrase: environmentVariablePassphrase,
        value: {
          [environmentVariableForm.key.trim()]: environmentVariableForm.value,
        },
      });
      setEnvironmentVariablePassphraseDialogOpen(false);
      setEnvironmentVariablePassphrase("");
      setEnvironmentVariablePassphraseAction("save");
      setEnvironmentVariableDialogOpen(false);
      setEditingEnvironmentVariableName("");
      setEnvironmentVariableForm({ key: "", value: "" });
      setEnvironmentVariables((current) => {
        const next = current.includes(environmentVariableForm.key.trim()) ? current : [...current, environmentVariableForm.key.trim()].sort();
        return next;
      });
      try {
        const status = await fetchSecretsStatus();
        setSecretsStatus(status);
      } catch {
        // keep existing status if refresh fails
      }
    } catch (saveError) {
      setError(saveError.message || "Unable to save environment variable.");
    } finally {
      setSavingEnvironmentVariable(false);
    }
  }

  async function handleConfirmEnvironmentVariableDelete() {
    if (!editingEnvironmentVariableName) return;
    setDeletingEnvironmentVariable(true);
    setError("");
    try {
      await deleteNamedSecret({
        name: editingEnvironmentVariableName,
        user_defined_type: ENVIRONMENT_VARIABLE_SECRET_TYPE,
        passphrase: environmentVariablePassphrase,
      });
      setEnvironmentVariablePassphraseDialogOpen(false);
      setEnvironmentVariablePassphrase("");
      setEnvironmentVariablePassphraseAction("save");
      setEnvironmentVariableDialogOpen(false);
      setEnvironmentVariables((current) => current.filter((name) => name !== editingEnvironmentVariableName));
      setEditingEnvironmentVariableName("");
      setEnvironmentVariableForm({ key: "", value: "" });
      try {
        const status = await fetchSecretsStatus();
        setSecretsStatus(status);
      } catch {
        // keep existing status if refresh fails
      }
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete environment variable.");
    } finally {
      setDeletingEnvironmentVariable(false);
    }
  }

  async function handleUnlockVault() {
    setUnlockingVault(true);
    setError("");
    try {
      const unlockDurationSeconds = durationPartsToSeconds(unlockDuration);
      const status = await unlockSecrets(unlockPassphrase.trim(), unlockDurationSeconds);
      setSecretsStatus(status);
      setUnlockPassphrase("");
      setUnlockDialogOpen(false);
      if (pendingIdentityName) {
        const identityName = pendingIdentityName;
        setPendingIdentityName("");
        setUnlockTargetType("vault");
        await handleEditIdentity(identityName);
      } else if (pendingEnvironmentVariableName) {
        const variableName = pendingEnvironmentVariableName;
        setPendingEnvironmentVariableName("");
        setUnlockTargetType("vault");
        await handleEditEnvironmentVariable(variableName);
      } else {
        setUnlockTargetType("vault");
      }
    } catch (unlockError) {
      setError(unlockError.message || "Unable to unlock secrets.");
    } finally {
      setUnlockingVault(false);
    }
  }

  async function handleLockVault() {
    setLockingVault(true);
    setError("");
    try {
      await lockSecrets();
      const status = await fetchSecretsStatus();
      setSecretsStatus(status);
    } catch (lockError) {
      setError(lockError.message || "Unable to lock secrets.");
    } finally {
      setLockingVault(false);
    }
  }

  function handlePickIdentityProvider(providerLabel) {
    if (providerLabel === "Git") {
      setIdentityTypeDialogOpen(false);
      setEditingIdentityName("");
      setGitIdentityProvider("github");
      setGitIdentityForm({
        name: "",
        url: GIT_PROVIDER_DEFAULT_URLS.github,
        username: "",
        gitUserName: "",
        gitUserEmail: "",
        accessToken: "",
      });
      setGitIdentityPassphrase("");
      setGitIdentityPassphraseDialogOpen(false);
      setGitIdentityDialogOpen(true);
      return;
    }
    setIdentityTypeDialogOpen(false);
  }

  function handleGitIdentityProviderChange(providerId) {
    setGitIdentityProvider(providerId);
    setGitIdentityForm((current) => ({
      ...current,
      url: GIT_PROVIDER_DEFAULT_URLS[providerId] ?? current.url,
    }));
  }

  async function handleEditIdentity(identityName) {
    setError("");
    try {
      const response = await fetchSecrets();
      const secrets = Array.isArray(response?.secrets) ? response.secrets : [];
      const identityRecord = secrets.find(
        (secret) => secret?.user_defined_type === GIT_IDENTITY_SECRET_TYPE && secret?.name === identityName,
      );
      if (!identityRecord || typeof identityRecord.value !== "object" || identityRecord.value === null) {
        throw new Error("Unable to load identity.");
      }
      const value = identityRecord.value;
      const provider = typeof value.provider === "string" ? value.provider : "github";
      setEditingIdentityName(identityName);
      setGitIdentityProvider(provider);
      setGitIdentityForm({
        name: typeof value.name === "string" && value.name.trim() ? value.name : identityName,
        url: typeof value.url === "string" ? value.url : GIT_PROVIDER_DEFAULT_URLS[provider] ?? "",
        username: typeof value.username === "string" ? value.username : "",
        gitUserName: typeof value.git_user_name === "string" ? value.git_user_name : "",
        gitUserEmail: typeof value.git_user_email === "string" ? value.git_user_email : "",
        accessToken: typeof value.access_token === "string" ? value.access_token : "",
      });
      setGitIdentityPassphrase("");
      setGitIdentityPassphraseDialogOpen(false);
      setGitIdentityDialogOpen(true);
    } catch (loadError) {
      if (loadError?.status === 423 || String(loadError?.message || "").includes("locked")) {
        setUnlockPassphrase("");
        setUnlockDuration({ years: "0", days: "0", hours: "23", minutes: "59" });
        setPendingIdentityName(identityName);
        setUnlockTargetType("identity");
        setUnlockDialogOpen(true);
        return;
      }
      setError(loadError.message || "Unable to load identity.");
    }
  }

  async function handleEditEnvironmentVariable(variableName) {
    setError("");
    try {
      const response = await fetchSecrets();
      const secrets = Array.isArray(response?.secrets) ? response.secrets : [];
      const variableRecord = secrets.find(
        (secret) => secret?.user_defined_type === ENVIRONMENT_VARIABLE_SECRET_TYPE && secret?.name === variableName,
      );
      if (!variableRecord || typeof variableRecord.value !== "object" || variableRecord.value === null) {
        throw new Error("Unable to load environment variable.");
      }
      const entries = Object.entries(variableRecord.value);
      const [key, value] = entries[0] || [variableName, ""];
      setEditingEnvironmentVariableName(variableName);
      setEnvironmentVariableForm({
        key,
        value: typeof value === "string" ? value : JSON.stringify(value),
      });
      setEnvironmentVariablePassphrase("");
      setEnvironmentVariablePassphraseDialogOpen(false);
      setEnvironmentVariableDialogOpen(true);
    } catch (loadError) {
      if (loadError?.status === 423 || String(loadError?.message || "").includes("locked")) {
        setUnlockPassphrase("");
        setUnlockDuration({ years: "0", days: "0", hours: "23", minutes: "59" });
        setPendingEnvironmentVariableName(variableName);
        setUnlockTargetType("variable");
        setUnlockDialogOpen(true);
        return;
      }
      setError(loadError.message || "Unable to load environment variable.");
    }
  }

  function resetSecretForm() {
    return undefined;
  }

  const statusTone = !secretsStatus
    ? "unknown"
    : !secretsStatus.initialized
      ? "warning"
      : secretsStatus.locked
        ? "locked"
        : "unlocked";
  const statusLabel = !secretsStatus
    ? "Unavailable"
    : !secretsStatus.initialized
      ? "Not Initialized"
      : secretsStatus.locked
        ? "Locked"
        : "Unlocked";
  const statusCopy = !secretsStatus
    ? "Secrets service is not reachable."
    : !secretsStatus.initialized
      ? "Initialize the secrets service before storing identities."
      : secretsStatus.locked
        ? "Your vault is locked. Agents will not be able to access secrets until you unlock."
        : `Unlocked for ${formatCountdown(secretsStatus.unlocked_until, nowMs)}`;
  const unlockDurationTotalSeconds = durationPartsToSeconds(unlockDuration);

  return (
    <section className="secrets-config">
      {error ? <div className="banner banner--error">{error}</div> : null}
      <div className="secrets-config__layout">
        <aside className="panel secrets-config__nav">
          <button
            type="button"
            className={`secrets-config__nav-item${section === "general-settings" ? " secrets-config__nav-item--active" : ""}`}
            onClick={() => setSection("general-settings")}
          >
            General Settings
          </button>
          <button
            type="button"
            className={`secrets-config__nav-item${section === "identities" ? " secrets-config__nav-item--active" : ""}`}
            onClick={() => setSection("identities")}
          >
            Identities
          </button>
          <button
            type="button"
            className={`secrets-config__nav-item${section === "environment-variables" ? " secrets-config__nav-item--active" : ""}`}
            onClick={() => setSection("environment-variables")}
          >
            Environment Variables
          </button>
        </aside>

        <section className="panel secrets-config__content">
          {section === "general-settings" ? (
            <>
              <div className="panel__header">
                <div className="panel__header-row">
                  <span className="panel__title">General Settings</span>
                </div>
              </div>
              <div className="panel__body secrets-config__panel-body secrets-config__panel-body--single">
                <div className="secrets-config__general-grid">
                  <section className="secrets-config__settings-card">
                    <div className="secrets-config__settings-copy">
                      <div className="secrets-config__settings-eyebrow">Appearance</div>
                      <div className="secrets-config__settings-title">Theme</div>
                      <div className="secrets-config__settings-description">Choose the look and feel for the entire Scryer workspace.</div>
                    </div>
                    <button
                      type="button"
                      className="secrets-config__theme-toggle"
                      onClick={onToggleTheme}
                      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                    >
                      <span className="secrets-config__theme-toggle-copy">
                        <span className="secrets-config__theme-toggle-label">Theme</span>
                        <span className="secrets-config__theme-toggle-value">{theme === "dark" ? "Dark" : "Light"}</span>
                      </span>
                      <span className="secrets-config__theme-toggle-icon" aria-hidden="true">
                        <SunMoon size={15} strokeWidth={2.1} />
                      </span>
                    </button>
                  </section>
                  <section className="secrets-config__settings-card">
                      <div className="secrets-config__settings-copy">
                        <div className="secrets-config__settings-eyebrow">Vault</div>
                        <div className="secrets-config__settings-title">Status</div>
                        <div className="secrets-config__settings-description">{statusCopy}</div>
                      </div>
                    <div className="secrets-config__vault-actions">
                      <span className={`secrets-config__status-pill secrets-config__status-pill--${statusTone}`}>{statusLabel}</span>
                      {secretsStatus?.initialized && secretsStatus.locked ? (
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => {
                            setUnlockPassphrase("");
                            setUnlockDuration({ years: "0", days: "0", hours: "23", minutes: "59" });
                            setPendingIdentityName("");
                            setPendingEnvironmentVariableName("");
                            setUnlockTargetType("vault");
                            setUnlockDialogOpen(true);
                          }}
                        >
                          Unlock
                        </button>
                      ) : null}
                      {secretsStatus?.initialized && !secretsStatus.locked ? (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={handleLockVault}
                          disabled={lockingVault}
                        >
                          {lockingVault ? "Locking..." : "Lock"}
                        </button>
                      ) : null}
                    </div>
                  </section>
                </div>
              </div>
            </>
          ) : section === "identities" ? (
            <>
              <div className="panel__header">
                <div className="panel__header-row">
                  <span className="panel__title">Identities</span>
                  <button type="button" className="secondary-button" onClick={() => setIdentityTypeDialogOpen(true)}>New Identity</button>
                </div>
              </div>
              <div className="panel__body secrets-config__panel-body secrets-config__panel-body--single">
                {loadingIdentities ? (
                  <div className="empty-copy empty-copy--inset">Loading identities...</div>
                ) : identities.length === 0 ? (
                  <div className="empty-copy empty-copy--inset">No identities saved yet.</div>
                ) : (
                  <div className="secrets-config__list">
                    {identities.map((identityName) => (
                      <button
                        key={identityName}
                        type="button"
                        className={`secrets-config__list-item${editingIdentityName === identityName && gitIdentityDialogOpen ? " secrets-config__list-item--active" : ""}`}
                        onClick={() => handleEditIdentity(identityName)}
                      >
                        <span className="secrets-config__list-title">{identityName}</span>
                        <span className="secrets-config__list-copy">Git identity</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {identityTypeDialogOpen ? (
                <div className="modal-backdrop" role="presentation" onClick={() => setIdentityTypeDialogOpen(false)}>
                  <div className="modal-card secrets-config__identity-dialog" role="dialog" aria-modal="true" aria-labelledby="identity-type-title" onClick={(event) => event.stopPropagation()}>
                    <div className="modal-card__header">
                      <div>
                        <h2 id="identity-type-title">Add an Identity</h2>
                      </div>
                      <button type="button" className="modal-card__close" onClick={() => setIdentityTypeDialogOpen(false)} aria-label="Close dialog">×</button>
                    </div>
                    <div className="secrets-config__identity-options">
                      {IDENTITY_PROVIDER_OPTIONS.map((provider) => {
                        const Icon = provider.icon;
                        return (
                          <button
                            key={provider.label}
                            type="button"
                            className="secrets-config__identity-option"
                            onClick={() => handlePickIdentityProvider(provider.label)}
                            disabled={provider.disabled}
                            aria-disabled={provider.disabled}
                          >
                            <span className="secrets-config__identity-option-icon" aria-hidden="true">
                              <Icon size={16} />
                            </span>
                            <span className="secrets-config__identity-option-label">{provider.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
              {gitIdentityDialogOpen ? (
                <div className="modal-backdrop" role="presentation" onClick={() => setGitIdentityDialogOpen(false)}>
                  <div className="modal-card secrets-config__identity-dialog" role="dialog" aria-modal="true" aria-labelledby="git-identity-title" onClick={(event) => event.stopPropagation()}>
                    <div className="modal-card__header">
                      <div>
                        <h2 id="git-identity-title">{editingIdentityName ? "Edit Git Identity" : "Add a Git Identity"}</h2>
                      </div>
                      <button type="button" className="modal-card__close" onClick={() => setGitIdentityDialogOpen(false)} aria-label="Close dialog">×</button>
                    </div>
                    <div className="secrets-config__git-provider-tabs" role="tablist" aria-label="Git provider">
                      {[
                        { id: "github", label: "GitHub" },
                        { id: "gitlab", label: "GitLab" },
                        { id: "self-hosted", label: "Self-hosted" },
                      ].map((provider) => (
                        <button
                          key={provider.id}
                          type="button"
                          className={`secrets-config__git-provider-tab${gitIdentityProvider === provider.id ? " secrets-config__git-provider-tab--active" : ""}`}
                          onClick={() => handleGitIdentityProviderChange(provider.id)}
                        >
                          {provider.label}
                        </button>
                      ))}
                    </div>
                    <div className="secrets-config__git-provider-form">
                      <label className="field">
                        <span className="field__label">Git Identity</span>
                        <input
                          className="field__input"
                          value={gitIdentityForm.name}
                          onChange={(e) => setGitIdentityForm((current) => ({ ...current, name: e.target.value }))}
                          placeholder="work-github"
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">URL</span>
                        <input
                          className="field__input"
                          value={gitIdentityForm.url}
                          onChange={(e) => setGitIdentityForm((current) => ({ ...current, url: e.target.value }))}
                          placeholder="https://git.example.com"
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">Username</span>
                        <input
                          className="field__input"
                          value={gitIdentityForm.username}
                          onChange={(e) => setGitIdentityForm((current) => ({ ...current, username: e.target.value }))}
                          placeholder="Username"
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">Access Token</span>
                        <input
                          className="field__input"
                          type="password"
                          value={gitIdentityForm.accessToken}
                          onChange={(e) => setGitIdentityForm((current) => ({ ...current, accessToken: e.target.value }))}
                          placeholder="Paste access token"
                        />
                      </label>
                      <div className="secrets-config__identity-form-section">
                        <div className="secrets-config__identity-form-section-label">Commit Attribution</div>
                        <label className="field">
                          <span className="field__label">user.name</span>
                          <input
                            className="field__input"
                            value={gitIdentityForm.gitUserName}
                            onChange={(e) => setGitIdentityForm((current) => ({ ...current, gitUserName: e.target.value }))}
                            placeholder="Jane Doe"
                          />
                        </label>
                        <label className="field">
                          <span className="field__label">user.email</span>
                          <input
                            className="field__input"
                            value={gitIdentityForm.gitUserEmail}
                            onChange={(e) => setGitIdentityForm((current) => ({ ...current, gitUserEmail: e.target.value }))}
                            placeholder="jane@example.com"
                          />
                        </label>
                      </div>
                    </div>
                    <div className="modal-actions">
                      {editingIdentityName ? (
                        <button
                          type="button"
                          className="secondary-button secrets-config__delete-action"
                          onClick={() => {
                            setError("");
                            setGitIdentityPassphrase("");
                            setGitIdentityPassphraseAction("delete");
                            setGitIdentityPassphraseDialogOpen(true);
                          }}
                          disabled={savingGitIdentity || deletingGitIdentity}
                        >
                          Delete
                        </button>
                      ) : null}
                      <button type="button" className="secondary-button" onClick={() => setGitIdentityDialogOpen(false)}>Cancel</button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => {
                          setError("");
                          setGitIdentityPassphrase("");
                          setGitIdentityPassphraseAction("save");
                          setGitIdentityPassphraseDialogOpen(true);
                        }}
                        disabled={(savingGitIdentity || deletingGitIdentity) || !gitIdentityForm.name.trim() || !gitIdentityForm.url.trim() || !gitIdentityForm.username.trim() || !gitIdentityForm.gitUserName.trim() || !gitIdentityForm.gitUserEmail.trim() || !gitIdentityForm.accessToken.trim()}
                      >
                        {savingGitIdentity ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              {gitIdentityPassphraseDialogOpen ? (
                <div className="modal-backdrop" role="presentation" onClick={() => setGitIdentityPassphraseDialogOpen(false)}>
                  <div className="modal-card secrets-config__identity-dialog" role="dialog" aria-modal="true" aria-labelledby="git-identity-passphrase-title" onClick={(event) => event.stopPropagation()}>
                    <div className="modal-card__header">
                      <div>
                        <h2 id="git-identity-passphrase-title">
                          {gitIdentityPassphraseAction === "delete" ? "This action requires confirmation" : "Unlock Secrets"}
                        </h2>
                        <p>
                          {gitIdentityPassphraseAction === "delete"
                            ? "Enter the secrets passphrase to delete this identity."
                            : "Enter the secrets passphrase to save this identity."}
                        </p>
                      </div>
                      <button type="button" className="modal-card__close" onClick={() => setGitIdentityPassphraseDialogOpen(false)} aria-label="Close dialog">×</button>
                    </div>
                    <label className="field">
                      <span className="field__label">Passphrase</span>
                      <input
                        className="field__input"
                        type="password"
                        value={gitIdentityPassphrase}
                        onChange={(event) => setGitIdentityPassphrase(event.target.value)}
                        placeholder="Enter passphrase"
                      />
                    </label>
                    <div className="modal-actions">
                      <button type="button" className="secondary-button" onClick={() => setGitIdentityPassphraseDialogOpen(false)}>Cancel</button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={gitIdentityPassphraseAction === "delete" ? handleConfirmGitIdentityDelete : handleConfirmGitIdentitySave}
                        disabled={(savingGitIdentity || deletingGitIdentity) || !gitIdentityPassphrase.trim()}
                      >
                        {gitIdentityPassphraseAction === "delete"
                          ? (deletingGitIdentity ? "Deleting..." : "Confirm & Delete")
                          : (savingGitIdentity ? "Saving..." : "Confirm & Save")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="panel__header">
                <div className="panel__header-row">
                  <span className="panel__title">Environment Variables</span>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setEditingEnvironmentVariableName("");
                      setEnvironmentVariableForm({ key: "", value: "" });
                      setEnvironmentVariablePassphrase("");
                      setEnvironmentVariablePassphraseAction("save");
                      setEnvironmentVariableDialogOpen(true);
                    }}
                  >
                    New Environment Variable
                  </button>
                </div>
              </div>
              <div className="panel__body secrets-config__panel-body secrets-config__panel-body--single">
                {loadingEnvironmentVariables ? (
                  <div className="empty-copy empty-copy--inset">Loading environment variables...</div>
                ) : environmentVariables.length === 0 ? (
                  <div className="empty-copy empty-copy--inset">No environment variables saved yet.</div>
                ) : (
                  <div className="secrets-config__list">
                    {environmentVariables.map((variableName) => (
                      <button
                        key={variableName}
                        type="button"
                        className={`secrets-config__list-item${editingEnvironmentVariableName === variableName && environmentVariableDialogOpen ? " secrets-config__list-item--active" : ""}`}
                        onClick={() => handleEditEnvironmentVariable(variableName)}
                      >
                        <span className="secrets-config__list-title">{variableName}</span>
                        <span className="secrets-config__list-copy">Environment variable</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {environmentVariableDialogOpen ? (
                <div className="modal-backdrop" role="presentation" onClick={() => setEnvironmentVariableDialogOpen(false)}>
                  <div className="modal-card secrets-config__identity-dialog" role="dialog" aria-modal="true" aria-labelledby="environment-variable-title" onClick={(event) => event.stopPropagation()}>
                    <div className="modal-card__header">
                      <div>
                        <h2 id="environment-variable-title">{editingEnvironmentVariableName ? "Edit Environment Variable" : "Add Environment Variable"}</h2>
                      </div>
                      <button type="button" className="modal-card__close" onClick={() => setEnvironmentVariableDialogOpen(false)} aria-label="Close dialog">×</button>
                    </div>
                    <div className="secrets-config__git-provider-form">
                      <label className="field">
                        <span className="field__label">Variable Name</span>
                        <input
                          className="field__input"
                          value={environmentVariableForm.key}
                          onChange={(event) => setEnvironmentVariableForm((current) => ({ ...current, key: event.target.value }))}
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">Value</span>
                        <input
                          className="field__input"
                          value={environmentVariableForm.value}
                          onChange={(event) => setEnvironmentVariableForm((current) => ({ ...current, value: event.target.value }))}
                        />
                      </label>
                    </div>
                    <div className="modal-actions">
                      {editingEnvironmentVariableName ? (
                        <button
                          type="button"
                          className="secondary-button secrets-config__delete-action"
                          onClick={() => {
                            setError("");
                            setEnvironmentVariablePassphrase("");
                            setEnvironmentVariablePassphraseAction("delete");
                            setEnvironmentVariablePassphraseDialogOpen(true);
                          }}
                          disabled={savingEnvironmentVariable || deletingEnvironmentVariable}
                        >
                          Delete
                        </button>
                      ) : null}
                      <button type="button" className="secondary-button" onClick={() => setEnvironmentVariableDialogOpen(false)}>Cancel</button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => {
                          setError("");
                          setEnvironmentVariablePassphrase("");
                          setEnvironmentVariablePassphraseAction("save");
                          setEnvironmentVariablePassphraseDialogOpen(true);
                        }}
                        disabled={(savingEnvironmentVariable || deletingEnvironmentVariable) || !environmentVariableForm.key.trim() || !environmentVariableForm.value.trim()}
                      >
                        {savingEnvironmentVariable ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              {environmentVariablePassphraseDialogOpen ? (
                <div className="modal-backdrop" role="presentation" onClick={() => setEnvironmentVariablePassphraseDialogOpen(false)}>
                  <div className="modal-card secrets-config__identity-dialog" role="dialog" aria-modal="true" aria-labelledby="environment-variable-passphrase-title" onClick={(event) => event.stopPropagation()}>
                    <div className="modal-card__header">
                      <div>
                        <h2 id="environment-variable-passphrase-title">
                          {environmentVariablePassphraseAction === "delete" ? "This action requires confirmation" : "Unlock Secrets"}
                        </h2>
                        <p>
                          {environmentVariablePassphraseAction === "delete"
                            ? "Enter the secrets passphrase to delete this environment variable."
                            : "Enter the secrets passphrase to save this environment variable."}
                        </p>
                      </div>
                      <button type="button" className="modal-card__close" onClick={() => setEnvironmentVariablePassphraseDialogOpen(false)} aria-label="Close dialog">×</button>
                    </div>
                    <label className="field">
                      <span className="field__label">Passphrase</span>
                      <input
                        className="field__input"
                        type="password"
                        value={environmentVariablePassphrase}
                        onChange={(event) => setEnvironmentVariablePassphrase(event.target.value)}
                        placeholder="Enter passphrase"
                      />
                    </label>
                    <div className="modal-actions">
                      <button type="button" className="secondary-button" onClick={() => setEnvironmentVariablePassphraseDialogOpen(false)}>Cancel</button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={environmentVariablePassphraseAction === "delete" ? handleConfirmEnvironmentVariableDelete : handleConfirmEnvironmentVariableSave}
                        disabled={(savingEnvironmentVariable || deletingEnvironmentVariable) || !environmentVariablePassphrase.trim()}
                      >
                        {environmentVariablePassphraseAction === "delete"
                          ? (deletingEnvironmentVariable ? "Deleting..." : "Confirm & Delete")
                          : (savingEnvironmentVariable ? "Saving..." : "Confirm & Save")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
      {unlockDialogOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setUnlockDialogOpen(false)}>
          <div className="modal-card secrets-config__identity-dialog" role="dialog" aria-modal="true" aria-labelledby="unlock-vault-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-card__header">
              <div>
                <h2 id="unlock-vault-title">Unlock Vault</h2>
                <p>
                  {unlockTargetType === "vault"
                    ? "Enter the secrets passphrase to unlock the vault for this session."
                    : `Please unlock your vault to access this ${unlockTargetType}.`}
                </p>
              </div>
              <button type="button" className="modal-card__close" onClick={() => setUnlockDialogOpen(false)} aria-label="Close dialog">×</button>
            </div>
            <label className="field">
              <span className="field__label">Passphrase</span>
              <input
                className="field__input"
                type="password"
                value={unlockPassphrase}
                onChange={(event) => setUnlockPassphrase(event.target.value)}
                placeholder="Enter passphrase"
              />
            </label>
            <div className="secrets-config__identity-form-section">
              <div className="secrets-config__identity-form-section-label">Unlock For</div>
              <label className="field">
                <span className="field__label">Years</span>
                <input
                  className="field__input"
                  type="number"
                  min="0"
                  max="99"
                  inputMode="numeric"
                  value={unlockDuration.years}
                  onChange={(event) =>
                    setUnlockDuration((current) => ({
                      ...current,
                      years: clampDurationPart(event.target.value, 0, 99),
                    }))
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">Days</span>
                <input
                  className="field__input"
                  type="number"
                  min="0"
                  max="364"
                  inputMode="numeric"
                  value={unlockDuration.days}
                  onChange={(event) =>
                    setUnlockDuration((current) => ({
                      ...current,
                      days: clampDurationPart(event.target.value, 0, 364),
                    }))
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">Hours</span>
                <input
                  className="field__input"
                  type="number"
                  min="0"
                  max="23"
                  inputMode="numeric"
                  value={unlockDuration.hours}
                  onChange={(event) =>
                    setUnlockDuration((current) => ({
                      ...current,
                      hours: clampDurationPart(event.target.value, 0, 23),
                    }))
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">Minutes</span>
                <input
                  className="field__input"
                  type="number"
                  min="0"
                  max="59"
                  inputMode="numeric"
                  value={unlockDuration.minutes}
                  onChange={(event) =>
                    setUnlockDuration((current) => ({
                      ...current,
                      minutes: clampDurationPart(event.target.value, 0, 59),
                    }))
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setUnlockDialogOpen(false)}>Cancel</button>
              <button
                type="button"
                className="primary-button"
                onClick={handleUnlockVault}
                disabled={unlockingVault || !unlockPassphrase.trim() || unlockDurationTotalSeconds <= 0}
              >
                {unlockingVault ? "Unlocking..." : "Unlock"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
