# API evolution policy

## Status

The API is pre-1.0. Its current contract version is `0.1.0`, reported in `GET /openapi.json`.

Pre-1.0 does **not** mean undocumented or silent breakage is acceptable. The project has local clients, agent integrations, and a live PM data store. Every externally observable change must be explicit, reviewed, and recorded.

## Contract artifacts

The contract consists of:

1. runtime OpenAPI: `GET /openapi.json`;
2. checked-in OpenAPI snapshot: [`openapi.json`](openapi.json);
3. conventions/workflows: [`api.md`](api.md);
4. change rationale: Git history and, for material changes, an entry in this document or a dated decision document.

The runtime OpenAPI document is authoritative for a deployed instance. The checked-in snapshot is authoritative for the source revision that produced it. A release must not intentionally deploy a contract different from the checked-in snapshot.

## What counts as a breaking change

Treat all of the following as breaking until a versioned replacement is available:

- removing or renaming a path, method, query parameter, request field, response field, enum value, or error shape;
- changing a field's type, requiredness, nullability, meaning, default, or validation behavior;
- changing sort order, traversal semantics, deletion behavior, authorization requirements, or side effects;
- changing the relationship represented by a path (for example blocker direction);
- changing how an existing actor/authorship field is interpreted.

Additive optional response fields and new endpoints are normally non-breaking, but they still require an OpenAPI snapshot update and documentation if they introduce a new concept or convention.

## Change process

### Additive change

1. Add or modify schemas first so OpenAPI describes the intended contract.
2. Implement the route and service behavior.
3. Regenerate `docs/openapi.json`.
4. Update `docs/api.md` when clients need a new workflow or convention.
5. Add regression coverage for the behavior when a test suite is present.
6. State the change in the commit/PR description.

### Breaking change while pre-1.0

1. Write a short compatibility note before implementation: what changes, why, which clients are affected, and the migration/rollout sequence.
2. Prefer a new additive endpoint or field plus a deprecation period over in-place replacement.
3. Update the OpenAPI snapshot, API version, and narrative documentation in the same change.
4. Update every known first-party client before removing the old behavior.
5. Record the removal date/commit and migration instructions in this file or a linked decision document.

### Version 1.0 and later

Adopt a `/api/v1` path prefix only when the team is willing to preserve a stable v1 contract. Do not add a version prefix merely as a label; it must provide a compatibility boundary. A future v2 should coexist with v1 until consumers migrate.

## Naming rules for new API surface

These rules apply to new endpoints and fields. Existing fields remain supported until deliberately migrated.

- Use plural resource nouns: `/api/projects`, `/api/tasks`, `/api/goals`.
- Use opaque resource IDs in path parameters: `/{project_id}`.
- Use nested routes only for a relationship or action that is owned by the parent: `/{project_id}/tasks`, `/{task_id}/blockers`.
- Use `GET`, `POST`, `PATCH`, `PUT`, and `DELETE` according to their ordinary REST semantics. A side-effecting command that is not CRUD must be named as an explicit action and documented as operational.
- Prefer lower snake_case JSON fields, ISO 8601 timestamps, and explicit nullable/optional schema types.
- Do not introduce a new authorship/identity field pair. New authenticated endpoints should derive identity from the request principal; migrations of older actor fields require a compatibility plan.
- Use a router-level `/api/<resource>` prefix and relative route declarations. This keeps source topology aligned with emitted paths.

## Release checklist

- [ ] OpenAPI snapshot regenerated and reviewed.
- [ ] `info.version` updated if the published contract changed.
- [ ] `docs/api.md` accurately describes new concepts and path conventions.
- [ ] Known clients have been checked for compatibility.
- [ ] Breaking changes include a migration/rollback note.
- [ ] Runtime `/openapi.json` has been compared with the checked-in snapshot after deployment.
