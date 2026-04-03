# Scryer — Handoff Document

Supervised autonomous execution system. UI is branded **Scryer** ("because f_ck your calendar.").

---

## Architecture

| Layer | Tech | Port |
|-------|------|------|
| Backend API | FastAPI + SQLAlchemy + SQLite | 8000 |
| Frontend | React 19 + Vite | 5173 |
| Orchestrator | Separate service (skills, workflows, messaging) | 8100 |

Database: `data/pmsystem.db` (SQLite). Schema auto-created via `Base.metadata.create_all`. No Alembic — column additions require manual `ALTER TABLE`.

3-layer backend: **Routes → Services → Models** with Pydantic schemas. All models use soft-delete (`is_deleted` / `deleted_at`) and timestamp mixins.

---

## Backend Models

| File | Table(s) | Notes |
|------|----------|-------|
| `project.py` | `projects` | Hierarchical via `parent_project_id` FK |
| `task.py` | `tasks` | Belongs to project or parent task. Has `task_type_id`, `status` |
| `task_type.py` | `task_types`, `task_type_templates` | Templates seeded globally (Debate, Research, Work, Bug); copied per-project |
| `comment.py` | `comments` | Polymorphic — targets either a project or task |
| `dependency.py` | `task_dependencies` | Directional: `blocking_task_id` blocks `blocked_task_id` |
| `agent.py` | `agents`, `agent_models` | 3 agents (Claude, Codex, Gemini) with their supported models. `agent_models.is_enabled` controls visibility in Execute dialog |
| `project_property.py` | `project_properties` | Key-value pairs per project |
| `skill_default.py` | `skill_defaults` | Default agent + model per skill name (PK = `skill_name`) |
| `mixins.py` | — | `TimestampMixin`, `SoftDeleteMixin` |

### Seeded Agents & Models

- **Claude**: 8 models (opus-4-6, sonnet-4-6, haiku-4-5, etc.)
- **Codex**: 12 models (codex-mini, o3, o4-mini, gpt-5.4, etc.)
- **Gemini**: 6 models (2.5-pro, 2.5-flash, etc.)

All skill defaults are seeded to `claude` / `claude-sonnet-4-6`.

---

## API Routes

### PM API (port 8000, prefix `/api`)

| Route file | Prefix | Key endpoints |
|------------|--------|---------------|
| `projects.py` | `/api/projects` | CRUD + children, subprojects, comments, properties, tasks |
| `tasks.py` | `/api/tasks` | CRUD + children, blockers, comments |
| `comments.py` | `/api/comments` | Create, update, delete |
| `agents.py` | `/api/agents` | Agent CRUD + `/agents/{id}/models` CRUD + `PATCH /agents/models/{id}` |
| `task_types.py` | `/api/task-types` | CRUD (query: `project_id`) |
| `project_properties.py` | `/api/project-properties` | CRUD (query: `project_id`) |
| `skill_defaults.py` | `/api/skill-defaults` | `GET /` list, `PUT /{skill_name}` upsert |

### Orchestrator API (port 8100, prefix `/api`)

Consumed by frontend only — not owned by this repo.

| Resource | Endpoints |
|----------|-----------|
| Skills | `GET /skills`, `GET /skills/{name}`, `GET/PUT /skills/{name}/files/{path}` |
| Workflows | `GET/POST /workflows`, `GET/PUT/DELETE /workflows/{name}` |
| Messaging | `GET /messaging/pending`, `POST /messaging/{id}/respond` |

---

## Frontend (ui/src/)

Single-page React app. All components live in `App.jsx`. No TypeScript, no state library — pure `useState` + `useEffect`.

### Views

| View ID | Component | Description |
|---------|-----------|-------------|
| `command-center` | `CommandCenter` | Home screen with tagline |
| `projects` | `ProjectWorkspace` / `ProjectFlowView` | Project browser + task management (two panes: project tree + tasks) |
| `skills-config` | `SkillsConfigScreen` | Skill file tree + code editor. `...` button per skill opens defaults dialog (agent + model) |
| `agents-config` | `AgentsConfigScreen` | Two-pane: agents list + model checkboxes to enable/disable |
| `orchestrator-config` | `OrchestratorConfigScreen` | Workflow CRUD with phase/skill editing |

### Dialogs

| Component | Purpose |
|-----------|---------|
| `ProjectDialog` | Create/edit project |
| `SubprojectDialog` | Create subproject |
| `TaskDialog` | Create/edit Work/Bug tasks |
| `ResearchTaskDialog` | Create/edit Research tasks (Question + Context fields stored in `description_md`) |
| `ExecuteTaskDialog` | Two-step: pick workflow → assign agents + models per skill per phase. Pre-fills from `skill_defaults` table |
| `PendingMessagesDialog` | View and respond to orchestrator messages |

### API Client (`api.js`)

Two base URLs:
- `VITE_API_BASE_URL` → PM API (default `http://127.0.0.1:8000/api`)
- `VITE_ORCHESTRATOR_API_BASE_URL` → Orchestrator (default `http://localhost:8100/api`)

### Constants (`constants.js`)

Task statuses: `unopened` → `in_planning` → `in_execution` → `ready_for_human_review` → `human_reviewed_and_closed` / `closed_without_human_review`

Each status has a display label and color tone (neutral, purple, blue, amber, green, slate).

---

## Key Patterns

- **Authorship**: Recorded as `(created_by_role, created_by_instance_key)` pairs — no user table
- **Task types per project**: Global templates copied into each project on creation
- **Research tasks**: Structured fields (Question, Context) stored as markdown sections in `description_md`
- **Skill defaults**: Per-skill agent + model stored in `skill_defaults` table, used to pre-fill Execute dialog
- **Model enable/disable**: `agent_models.is_enabled` toggled via Agents Config screen; disabled models hidden from Execute dialog
- **View persistence**: `activeView`, `projectsPane`, selected project, sidebar collapsed state all saved to `localStorage`
- **Pending messages**: Polled every 5 seconds from orchestrator, shown as badge indicator

---

## File Paths

```
pmsystem/
├── app/
│   ├── main.py              # FastAPI app entry point
│   ├── config.py             # Settings (env prefix: PMSYSTEM_)
│   ├── db.py                 # Engine, session, create/drop schema
│   ├── models/               # SQLAlchemy models (9 files)
│   ├── schemas/              # Pydantic schemas
│   ├── services/             # Business logic layer
│   └── api/
│       ├── router.py         # Aggregates all route modules
│       └── routes/           # FastAPI route modules (7 files)
├── data/
│   └── pmsystem.db           # SQLite database
├── ui/
│   ├── index.html            # Entry point (title: Scryer)
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx          # React mount
│       ├── App.jsx           # All components (~3000 lines)
│       ├── api.js            # API client functions
│       ├── constants.js      # Status labels, order, tones
│       └── styles.css        # All styles
└── pyproject.toml
```

---

## Running

```bash
# Backend
cd pmsystem
uvicorn app.main:app --reload --port 8000

# Frontend
cd ui
npm run dev
```

Orchestrator runs separately on port 8100 (see ~/Code/tmuxer).

---

## Current Handoff Update (2026-03-19)

This section captures the work completed in the current session after the original handoff above.

### Home Screen / Running Processes

- The running-process home screen (`CommandCenter` in `ui/src/App.jsx`) was redesigned away from the old vertical detail list.
- Project grouping accordion remains.
- Expanded process state now renders as a horizontal phase flow with phase columns and step cards.
- Expanded process title is clickable and routes to the related project flow view.
- The top summary line is now left-aligned and tighter vertically.
- Home screen copy now includes:
  `You have <k> pending notifications. Feeling paranoid? Hit the big red button.`
- `big red button` is inline clickable text with tooltip/aria warning text:
  `This will stop everything executing. Be careful.`

### Panic Stop / Kill Controls

Backend:
- Added PM API endpoint:
  `POST /api/panic-stop`
- Added PM API endpoint:
  `POST /api/panic-stop/{process_id}`
- Backend implementation is in:
  `app/services/panic_stop.py`
- Panic stop behavior:
  - fetch active orchestrator processes
  - pause process(es) via orchestrator
  - kill referenced tmux sessions
  - reset linked PM task(s) to `unopened`
  - clear matching pending orchestrator messages

Frontend:
- Home screen supports full panic stop.
- Each running process row now has its own right-aligned `Kill` button for targeted stop.
- After stop, frontend refreshes both running processes and pending notifications.

Important limitation:
- The orchestrator API still does **not** expose delete/rewrite/cancel-history semantics.
- Current stop behavior is a pragmatic reset, not a true process-history-preserving rewind.

### Session / Terminal Dialog Changes

- Terminal dialog title now shows:
  `project / task / skill`
  instead of raw tmux session name.
- This was updated for:
  - `Open Session` from home-screen process flow
  - `Attach to Session` from pending messages

### Pending Messages Dialog

- Dialog title now shows only:
  `project / task`
- Clicking the title toggles a subtitle showing:
  - workflow
  - phase
  - skill

### Skill Defaults

- Confirmed skill-default implementation locations:
  - `app/models/skill_default.py`
  - `app/services/skill_defaults.py`
  - `app/api/routes/skill_defaults.py`
  - `app/schemas/skill_default.py`
  - frontend usage in `ui/src/App.jsx` and `ui/src/api.js`
- Database was updated so all `skill_defaults` rows with `default_agent_key = 'claude'` now use:
  `claude-haiku-4-5-20251001`

### Process Flow UI Behavior

- Phase-level badges were removed from expanded flow cards.
- Step status labels normalize:
  - `rfi` -> `waiting`
  - `done` -> `completed`
  - `dispatched` -> `running`
- Pending phases no longer show redundant step-level pending badges.
- Steps with no session center the skill name.
- Running steps show:
  - `Open Session`
  - agent name below the button
  - runtime text in parentheses, e.g. `started 8 min ago`
- Relative time formatting now uses spaces:
  - `1 d, 3 h, 5 min`
- If running duration is `0 min`, collapsed row copy uses:
  `just started`

### Session Liveness / Open Session Visibility

- Expanded flow now validates session existence before opening the terminal dialog.
- If a session is already dead when `Open Session` is clicked:
  - dialog does not open
  - session availability is marked false in UI state
- Completed steps are polled for session liveness while the selected process is open.
- Poll interval for completed-step session validation:
  `10s`
- Once a completed step’s session disappears, `Open Session` should disappear for that step.

Important note:
- There was a bug where polling did not activate for orchestrator statuses like `DONE`; this was fixed by normalizing `done -> completed`.
- If `Open Session` still appears incorrectly after that fix, the next place to inspect is the actual live process payload from the orchestrator.

### Dark Mode Improvements

- Increased contrast for:
  - home summary copy
  - pending notifications link
  - panic link
  - collapsed process row title/meta/timestamp
  - waiting pill in dark mode

### Project Flow Screen

- Fixed task row context menu clipping at the panel edge by allowing visible overflow on flow panels.

### Polling Summary

- Home screen process summaries poll every:
  `5s`
- Home screen selected-process detail polls every:
  `5s`
- Completed-step session liveness polling in expanded home-screen flow:
  `10s`
- Project flow screen currently has:
  no periodic polling

### Verification Performed

- Python compile passed for backend changes around panic stop.
- `npm run build` passed repeatedly after frontend changes.
- Existing Vite chunk-size warning remains and is unrelated to this session’s work.

### Known Open Issues / Next Steps

1. The horizontal process flow is functionally much better than before, but visually still needs refinement:
   - less empty vertical space
   - better connector quality
   - better hierarchy inside phase cards
2. If multiple completed/running steps still appear to open the same session, verify the live orchestrator payload:
   - UI now prefers `step.detail.session_id`-style fields when available
   - if all buttons still land in one terminal, the orchestrator is likely returning the same session id for those steps
3. The per-process and panic-stop flows should eventually be replaced or extended by a true orchestrator-side cancel/delete/reset API.
4. Project flow screen still lacks periodic polling.
5. If backend is not running with reload, restart PM API after backend code changes so panic-stop endpoints are active.
