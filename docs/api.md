# API reference and contract

## Source of truth

The OpenAPI document is the executable API contract:

- running service: `GET /openapi.json`
- interactive Swagger UI: `/docs`
- interactive ReDoc: `/redoc`
- checked-in snapshot: [`openapi.json`](openapi.json)

Regenerate the checked-in snapshot from the current application before a release:

```bash
python -m app.scripts.export_openapi
```

This document explains the API's conventions and workflows. It deliberately does not duplicate every request/response field; clients should generate or validate against OpenAPI.

## Version and base path

The current API is **pre-1.0** (`0.1.0`). All application resources are under `/api`; system health is at `/healthz`.

Examples in this document use paths such as `GET /api/projects`, not an assumed deployment host. A reverse proxy may add its own external host or path prefix, but it must preserve these application paths.

The version is exposed in `GET /openapi.json` (`info.version`). There is no `/v1` path prefix yet. See [API evolution policy](api-evolution.md) for the compatibility and change process.

## Resource map

| Resource | Primary endpoint | Main related endpoints |
| --- | --- | --- |
| Projects | `/api/projects` | `/{id}/children`, `/{id}/subprojects`, `/{id}/tasks`, `/{id}/comments`, `/{id}/properties`, `/{id}/repo-link`, `/deleted` |
| Tasks | `/api/tasks` | `/{id}/children`, `/{id}/blockers`, `/{id}/comments`, `/{id}/properties`; project task reorder and deleted lists |
| Task types | `/api/task-types?project_id={id}` | project-specific task-type definitions |
| Tags | `/api/tags` | attach/remove tags via `/api/tags/tasks/{task_id}` |
| Comments | `/api/comments` | project, task, or goal-checklist-item comments |
| Project/task properties | `/api/project-properties`, `/api/task-properties` | key/value metadata attached to a parent resource |
| Goals | `/api/goals` | `/full`, `/search`, `/activity`, `/updated`, `/finished`, checklist items, relationships |
| Notes | `/api/notes?entity_type={project|task}&entity_id={id}` | Markdown content is returned by `GET /api/notes/{id}` |
| Attachments | `/api/attachments?entity_type={project|task}&entity_id={id}` | multipart upload and `/content` download/inline read |
| Agents | `/api/agents` | agent model definitions under `/{id}/models` |
| Skill defaults | `/api/skill-defaults` | one default per skill name |
| Operational control | `/api/panic-stop` | stop all active orchestration or one process |

Every exact method, parameter, request schema, and response schema is in OpenAPI. A client must not infer unsupported filters or fields from this table.

## Shared conventions

### Identifiers and timestamps

Resource IDs are opaque strings. Clients must not derive meaning from them. Timestamps are returned as ISO 8601 date-times. `created_at` and `updated_at` are server-managed.

### Soft deletion

Most mutable domain resources are soft-deleted. Normal collection and detail reads exclude deleted resources. The currently supported deleted-resource lists are:

- `GET /api/projects/deleted`
- `GET /api/projects/{project_id}/tasks/deleted`

Deletion is not currently a general restore contract. Do not assume that deleting and recreating a resource with the same uniqueness key will work; consult the relevant API schema and behavior first.

### Hierarchies and traversal

Projects and tasks can have parent relationships. Recursive collection endpoints use a `depth` query parameter:

- `0`: direct relations only;
- positive integer: at most that many hops;
- `-1`: full reachable traversal.

This convention applies to project children, task children, and task blockers.

### Task blockers

`POST /api/tasks/{task_id}/blockers` declares that the target task is blocked by the `blocking_task_id` in the request. Dependencies are directional. A task cannot block itself, and dependency cycles are rejected.

### Authorship fields

The current pre-1.0 API records authorship in request payloads. Existing resources use the field pairs below:

- project/task/comment/note/attachment creation: `created_by_role` + `created_by_instance_key`, or comment `author_role` + `author_instance_key`;
- goal/checklist/relationship mutations: `actor_role` + `actor_instance_key`.

These names are legacy contract details. New endpoints must follow the evolution policy rather than introduce another actor-field convention.

### Errors

Current responses use FastAPI's `detail` field. Typical statuses are `404` for a missing active resource, `400` for a domain validation failure, and `422` for request-schema validation. The structured error format is not yet versioned or uniform; clients must handle documented FastAPI validation responses until that work is completed.

### Operational endpoints

`/api/panic-stop` and repository-link operations have host-level side effects. They are not ordinary CRUD endpoints. Clients must invoke them deliberately and should read the corresponding OpenAPI request/response descriptions before use.

## Client integration checklist

1. Fetch or generate types from `GET /openapi.json`; do not hand-copy schema fields.
2. Pin a snapshot/version in the client and diff it when updating the service.
3. Use only documented query parameters and enum values.
4. Treat IDs as opaque and timestamps as server-owned.
5. Handle `400`, `404`, and `422` as expected responses.
6. Do not treat CORS as an authorization signal.
7. For a breaking API change, follow [API evolution policy](api-evolution.md) before deploying clients and service.
