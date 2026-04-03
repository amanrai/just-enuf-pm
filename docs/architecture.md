# Architecture

## Design Goals

- API-first
- SQLite-first
- Soft-delete only
- Modular service layer
- Extensible domain model

## Package Layout

- `app/main.py`
  FastAPI application entrypoint.
- `app/config.py`
  Environment-driven settings.
- `app/db.py`
  Engine, session factory, metadata helpers.
- `app/models/`
  SQLAlchemy ORM models.
- `app/schemas/`
  Pydantic request/response models.
- `app/services/`
  Business rules and query logic.
- `app/api/`
  FastAPI dependencies and routers.
- `app/scripts/`
  Schema lifecycle and seed scripts.

## Core Invariants

- A project may have zero or one parent project.
- Projects can carry extensible key/value project properties.
- A task must have a parent project, a parent task, or both.
- A task may have zero or one parent task.
- Dependencies are directional and acyclic.
- Task type behavior is enforced by the backend.
- Comments belong to either a task or a project.
- Authorship is stored inline on records as `role + instance_key`.

## Soft Delete

All mutable domain entities use:

- `is_deleted`
- `deleted_at`

Application queries filter deleted rows by default.

## Recursive Queries

The service layer exposes recursive traversal for:

- task blockers
- task children
- project children

Project-scoped convenience routes sit on top of the same service layer so common flows do not require clients to compose generic endpoints manually.

The `depth` parameter behaves as:

- `0`: direct relations only
- positive integer: bounded traversal
- `-1`: full transitive traversal
