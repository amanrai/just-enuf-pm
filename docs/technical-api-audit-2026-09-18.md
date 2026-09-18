# just-enuf-pm API technical audit

**Date:** 2026-09-18  
**Repository reviewed:** `common-volume/repos/just-enuf-pm` at `1e77355` (`Add goals API`)  
**Live service checked:** configured Scryer PM API, using its OpenAPI document and read-only requests  
**Scope:** backend/API design, data integrity, security, operations, performance, testability, and documentation. This is an architectural audit, not a penetration test or load test.

## Executive assessment

This is a strong **local-first single-user prototype**: the domain is understandable, FastAPI/Pydantic give it a usable machine-readable contract, and the service layer captures several important workflow rules. It is already more coherent than a generic CRUD app.

It is not yet safe to regard as a trusted shared service or a durable control plane for unattended agents. The central gaps are **no authentication or authorization**, **unbounded reads with no concurrency contract**, **incomplete hierarchy integrity**, **ad hoc schema migration**, and **no automated tests**. The API can remain intentionally small; the next step should be to make its existing primitives reliable and explicit rather than add more surface area.

The live OpenAPI document reports **59 paths and 96 operations**, title `PM System`, version `0.1.0`, and **no security scheme**.

## What is working well

### 1. The domain is concrete and reasonably well separated

The API has useful core primitives rather than prematurely modeling a large enterprise PM suite:

- projects and nested projects;
- tasks, task types, tags, flexible task placement, and ordering;
- directional task blockers;
- comments, notes, attachments, and arbitrary properties;
- project-to-repository links;
- agents/models and a goals/checklist/activity subsystem.

The code cleanly separates routers, Pydantic schemas, SQLAlchemy models, and services. Most routes are thin adapters over service methods. That makes business rules inspectable and gives a good base for tests.

### 2. Several important invariants are already enforced

Examples:

- A task must have a project or a parent task (both is allowed).
- Comments must target exactly one supported resource; a reply must target the same resource as its parent.
- Blocker edges cannot be self-referential or cyclic, and task types may prohibit dependencies.
- Project/task property and task-type names have useful uniqueness constraints.
- Soft-deleted entities are filtered by the common `active()` query helper.
- Goals and checklist items reject blank titles at both application and database levels.
- Attachments/notes restrict their polymorphic target to projects or tasks and sanitize stored filenames.

These choices are particularly good for agent workflows because they prevent obvious structural corruption without trying to impose a heavyweight process model.

### 3. The API is discoverable and practical to use

FastAPI produces a live OpenAPI description, Swagger UI, and typed response schemas. The live service has a functioning health endpoint. Useful convenience endpoints exist for common client flows, such as project-scoped task creation, nested traversal, blockers, repo links, and goal activity.

`depth=0 | positive integer | -1` is a consistent traversal convention for project children, task children, and blockers. Project responses now expose both the repository remote URL and a relative local path, which let clients associate PM records with local checkouts.

### 4. Local-first configuration is simple

The system has few moving parts: SQLite, a configured common-volume root, and filesystem-backed attachments. `shareable.env` intentionally leaves machine-specific secrets out of the repository and currently contains only shareable path configuration. This is appropriate for the current deployment model.

## Findings and recommendations

Priority reflects risk to data/control today, not implementation effort.

### P0 — Any network-reachable caller has full control

**Evidence**

- The live OpenAPI document contains no `securitySchemes` and no operation-level security requirements.
- There is no authentication dependency or authorization check in the routers.
- Authorship fields (`created_by_role`, `author_role`, `actor_role`, and instance keys) are client-supplied metadata, not verified identity.
- CORS allows only selected browser origins, but CORS is not API access control and does not restrict non-browser clients.
- `POST /api/panic-stop` and `POST /api/panic-stop/{process_id}` require no credential. They can pause orchestrator processes, kill named tmux sessions on the API host, reset task statuses, and respond to pending messages.
- Repository-link updates invoke background `git` operations on the API host, also without caller authorization.

**Impact**

Anyone who can reach the service can read all PM data, impersonate authors, change or soft-delete records, retrieve attachments, trigger repository fetches, or stop running work. Tailnet-only reachability reduces exposure but does not establish trust boundaries.

**Recommendation**

Before expanding use beyond one trusted interactive client:

1. Put the service behind an authenticated boundary (tailnet identity-aware proxy or a small bearer-token layer are both viable first steps).
2. Add a request identity dependency and derive actor fields server-side; do not accept identity as authoritative request content.
3. Separate permissions at least into `read`, `write`, and `operator` scopes. Panic stop, repository operations, and attachment writes require `operator` or a similarly elevated scope.
4. Log authenticated principal, action, target ID, and request/correlation ID for all mutations.

Do not begin with elaborate multi-tenant RBAC. A single-user/service-token policy is sufficient if it is enforced consistently.

### P0 — Hierarchies can be made cyclic

**Evidence**

- Project updates reject only `parent_project_id == project_id`; they do not check whether the proposed parent is a descendant.
- Task updates validate that a proposed parent task exists but do not reject `parent_task_id == task_id` or an indirect parent-task cycle.
- The database has only a task “has at least one parent” constraint; it has no acyclic hierarchy constraint.

**Impact**

A project cycle such as `A → B → A` or a task self-cycle can be written. Traversal uses a `seen` set, so reads will usually terminate, but hierarchy semantics, ordering, UIs, and future recursive queries become unreliable. This is data corruption rather than a cosmetic edge case.

**Recommendation**

Add one reusable ancestor-check service for each hierarchy and enforce it on create/update/parent-attach:

- reject self-parenting;
- walk parents from the candidate parent and reject if the target appears;
- cap or detect corrupt pre-existing chains defensively;
- add tests for direct and indirect cycles.

For SQLite, application enforcement is appropriate initially. Add a repair/audit command that reports any existing cycles before shipping the rule.

### P1 — Schema evolution is unsafe and not reproducible

**Evidence**

- `create_schema()` runs at application startup by default (`auto_create_schema=True`).
- `_ensure_runtime_migrations()` contains imperative schema changes embedded in application startup.
- One migration renames and recreates the `comments` table with foreign keys temporarily disabled, copies rows, then drops the old table.
- There is no migration history, migration lock, compatibility check, backup hook, or explicit deploy procedure.

**Impact**

A code deploy can mutate production data merely by starting a process. Concurrent starts can race. Table reconstruction can unintentionally lose indexes, triggers, or future schema details. It is difficult to know exactly which schema version a database has or roll back safely.

**Recommendation**

Adopt Alembic (or a deliberately small equivalent migration runner) before the next data-model change:

1. Create a baseline migration from the current schema.
2. Run migrations as an explicit deployment step, not in web-process startup.
3. Record revision state in the database and fail fast on mismatches.
4. Back up SQLite before a nontrivial migration and verify restore instructions.
5. Set `auto_create_schema=False` outside local development.

### P1 — List/search endpoints will not scale and have no synchronization contract

**Evidence**

- Projects, tasks, comments, tags, agents, properties, notes, attachments, and most goals lists return whole result sets without limit/cursor pagination.
- Goal full-list/search code first builds full goal rows, loads related events and comments, and then filters/sorts in Python. Search applies `limit` only after constructing candidate results.
- `list_goals()` calculates latest event timestamps by loading all activity events for the returned goals.
- Blocker traversal retrieves each blocker task individually, creating an N+1 query pattern.
- There are no ETags, `updated_since` equivalents for most resources, revision numbers, cursors, or optimistic-concurrency controls.

**Impact**

The current data size is likely fine, but agent polling and UI refreshes will grow response size and SQLite work linearly. Concurrent writers can silently overwrite each other: `PATCH` has last-write-wins behavior with no version precondition. Clients cannot efficiently perform reliable incremental sync.

**Recommendation**

Define a standard collection contract before adding more resources:

- cursor pagination with stable ordering and a bounded default/max page size;
- common `updated_since`/cursor sync semantics where needed;
- explicit filter grammar per resource;
- a `version`/`updated_at` precondition for conflict-sensitive updates (for example `If-Match` or a request field);
- indexes for foreign keys and frequent filters/orderings (`project_id`, `parent_*_id`, `is_deleted`, `updated_at`, dependency endpoints, comments, activity events).

Optimize only after capturing representative query plans, but the API contract should be fixed now.

### P1 — Error handling and validation do not provide a stable client contract

**Evidence**

- Domain validation errors map to a generic `400`; FastAPI body/query errors use its default `422`; unhandled SQL integrity errors become a generic server error.
- Pydantic models do not set `extra="forbid"`, so unknown JSON fields are silently ignored by default.
- Many text fields have database length declarations but no request-side length limits; SQLite does not enforce declared `VARCHAR(n)` lengths in the usual way.
- Task status is validated by a service-owned string set rather than an enum exposed in the schema/OpenAPI contract.
- Some API behavior is inconsistent: goal deletes require an actor request body while other deletes do not; creation/authorship fields use several names; and notes are created with a 200 response while most create routes use 201.

**Impact**

Clients can believe an unsupported field was accepted, cannot reliably distinguish duplicate/conflict/precondition/domain failures, and must carry resource-specific conventions. This is especially costly for agents, which benefit from precise repairable errors.

**Recommendation**

Create an API-error envelope and adopt it consistently, e.g. `{ "error": { "code", "message", "details", "request_id" } }`. Then:

- use explicit status codes (`400` malformed/domain input, `404`, `409` uniqueness/conflict, `412` version conflict, `413` upload too large, `422` schema validation if retained);
- add a SQLAlchemy `IntegrityError` translator for known constraints;
- forbid unknown fields on write models;
- use `StrEnum`/literal values plus field limits and normalization;
- standardize actor/identity handling and mutation response conventions.

### P1 — Filesystem and operational side effects need guardrails

**Evidence**

- Attachment upload reads the entire file into memory (`await upload.read()`) and writes it directly to the shared filesystem.
- There is no upload size/type allowlist, malware/content policy, quota, rate limit, or storage failure compensation.
- Notes are written to disk before their DB row is committed; attachment files are written before their DB row is committed. A subsequent DB error leaves orphaned files. Delete removes a file before the DB soft-delete commit, creating the inverse inconsistency on a DB failure.
- Attachment reads return inline content based on caller-controlled uploaded MIME type.
- Repo-link updates spawn in-process daemon threads and run `git clone`/`fetch`; the status is persisted, but the job is lost on restart and has no durable queue, retry policy, timeout, or audit trail.

**Impact**

A large or malicious upload can exhaust memory/disk or be served in a risky browser context. Storage and database state can drift. Repository operations are hard to observe or recover after failure.

**Recommendation**

- Stream uploads to a temporary file while enforcing a configured maximum size and approved content types.
- Store files atomically, then commit metadata; add periodic orphan cleanup/reconciliation.
- Force download or conservative content-disposition for active formats unless safely rendered by a dedicated viewer.
- Make repo fetch a persisted job with state transitions, retry/error detail, single-flight locking, and an operator-only trigger. Validate allowed remote schemes/hosts if remotes can be supplied by non-operators.

### P1 — No automated test suite protects the business rules

**Evidence**

- The project declares `pytest` and `httpx` development dependencies but contains no `tests/` files.
- The retained checkout’s ignored `.venv` is broken: its `python` symlink points to `/Users/amanrai/miniconda3/bin/python3`, which is absent. Therefore its local test runner could not start.
- Python compilation could not be performed with that environment for the same reason.

**Impact**

The key rules—dependency acyclicity, soft deletes, comments, hierarchy behavior, goal graduation, and migrations—have no executable regression protection. A stale copied virtual environment makes a clean checkout appear runnable when it is not.

**Recommendation**

1. Delete and recreate the ignored `.venv` from `uv.lock`; never rely on a copied environment.
2. Add a temporary SQLite test fixture and API client fixture.
3. Start with invariants, not broad endpoint snapshots:
   - project/task direct and indirect cycle rejection;
   - dependency cycle and duplicate handling, including re-add after soft delete;
   - comment target/reply validation;
   - task status/type behavior;
   - repo-link slug/path behavior;
   - goal checklist graduation and activity events;
   - attachment cleanup on failed metadata writes.
4. Add CI that runs formatting/linting, unit/API tests, and an OpenAPI compatibility check.

### P0 — Documentation, naming, and API evolution are drifting

**Evidence**

- `docs/api.md` lists unprefixed paths such as `/projects`, but the actual routes are `/api/projects` and the live OpenAPI has 59 paths.
- That document omits the goals API, deleted-resource endpoints, agents, assets, repo links, panic stop, and many query/response details.
- The live API remains `0.1.0`; there is no compatibility/deprecation policy.
- Goals use explicit absolute paths in their router while other resources set a router prefix. It works, but it makes the route topology less uniform.

**Impact**

Clients cannot safely rely on the hand-written documentation, and future changes can silently break agents or UIs. The OpenAPI document is closer to truth but needs to be treated as the canonical contract.

**Recommendation**

- Make OpenAPI the source of generated reference documentation and keep a concise narrative “concepts and workflows” guide beside it.
- Correct `docs/api.md` immediately or replace it with links to `/docs`, `/redoc`, and a checked-in generated OpenAPI snapshot.
- Establish `v1` only when willing to maintain compatibility. Until then, document the API as explicitly pre-1.0 and publish breaking-change notes.
- Use one router convention and a consistent URL/payload naming policy.

### P2 — Observability and deployment readiness are minimal

**Evidence**

- `/healthz` always returns `{ "status": "ok" }`; it does not verify SQLite accessibility, migration state, attachment storage, or orchestrator dependency.
- There is no structured logging, request ID, metrics, tracing, audit log, backup/restore command, or documented production run command.
- SQLite is appropriate for the stated scope, but the engine is configured without explicit SQLite busy timeout, WAL policy, or multi-process deployment guidance.

**Impact**

Failures will be difficult to diagnose, and a green health check can coexist with a broken data or orchestration dependency. Concurrent agent writes may encounter SQLite lock contention without a defined operational response.

**Recommendation**

Add lightweight operational basics:

- `/livez` for process liveness and `/readyz` for required dependency checks;
- JSON logs with request IDs and mutation/audit events;
- explicit SQLite backup/restore and integrity-check procedures;
- a documented one-process deployment model, WAL/busy-timeout decision, and connection backup schedule;
- metrics only after deciding where they will be collected.

## Specific correctness issues worth fixing early

1. **Project hierarchy:** indirect cycles are possible.
2. **Task hierarchy:** self and indirect cycles are possible.
3. **Soft-deleted dependency re-add:** the database unique constraint covers deleted rows too. Deleting a dependency then attempting to recreate the same pair is likely to fail rather than revive the old row or create a valid new active edge. Similar soft-delete/uniqueness behavior should be audited for tags and other constrained entities.
4. **Slug/repo-link coupling:** changing a project slug does not automatically update `repo_subpath`; a separate `PUT /repo-link` does. That was handled manually for this repository but should be an intentional transaction or clearly documented policy.
5. **Soft deletion is not restoration:** there are list-deleted routes for projects/tasks but no documented restore endpoints, and related records are not consistently cascaded/hidden by a parent’s deletion. Decide whether “soft delete” means recoverable archival or simply non-destructive removal, then implement restoration/cascade behavior accordingly.
6. **Goal graph semantics:** goal relationships permit duplicate edges and do not enforce graph rules. That may be correct for a generic `supports` relation, but it must be an explicit product decision before clients infer hierarchy/dependency semantics from it.

## Suggested delivery sequence

This ordering keeps the project small while protecting the existing value.

### Milestone A — Make the current service safe to operate

1. Decide the trust boundary and add a minimal authenticated identity/scoping layer.
2. Restrict panic stop and repo operations to operator scope.
3. Add project/task hierarchy cycle prevention.
4. Add a test harness and tests for all existing invariants.
5. Recreate the local virtual environment from lockfile and document the development bootstrap.

### Milestone B — Make data durable and client behavior predictable

1. Introduce explicit migrations and backup-before-migrate behavior.
2. Standardize validation/error envelopes, mutation responses, identity fields, and resource naming.
3. Resolve soft-delete/recreate/restore semantics.
4. Add a canonical OpenAPI workflow and fix the stale API notes.

### Milestone C — Make it dependable for agent/UI use

1. Define pagination, filters, incremental sync, and optimistic concurrency rules.
2. Add relevant indexes and remove obvious N+1/full-materialization queries.
3. Harden attachment and repo-operation workflows.
4. Add readiness checks, structured logs, audit events, and SQLite operational guidance.

## Decisions to make together

These are product/operational choices, not merely implementation details:

1. **Who should reach the service?** Only local machine processes, all tailnet devices, or specific humans/agents via tokens?
2. **What may an agent do without approval?** Read/write tasks only, or also upload files, alter repo links, and invoke operational controls?
3. **What is the intended sync model?** UI polling, event stream, incremental cursor sync, or a combination?
4. **How strict should deletion be?** Archive-and-restore, hide-only, or cascade/archive descendants?
5. **Should goals remain separate from projects/tasks?** The current design says yes; confirm the relationship and graph semantics before clients depend on it.
6. **Is SQLite single-host only a firm boundary?** If yes, document and optimize for it. If no, plan a migration path before usage creates difficult operational assumptions.

## Evidence and limitations

Reviewed source includes routers, schemas, services, models, configuration, schema creation/migration code, documentation, package metadata, and Git state. The live PM API was queried read-only for health, project data, validation behavior, and its OpenAPI document. The live contract reported 59 paths/96 operations and no declared security scheme.

No destructive API probes, load tests, authentication bypass attempts, fuzzing, backup restore drill, or database inspection on the live server were performed. No test suite was run because the retained checkout has no test files and its ignored virtual environment has a stale interpreter symlink. Findings that rely on write paths are source-reviewed conclusions and should be converted into regression tests before or alongside fixes.
