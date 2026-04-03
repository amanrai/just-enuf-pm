# just-enuf-pm

Note: this project includes vibe-coded elements produced with Codex and Claude.

Standalone, local-first PM system for people building agentic workflows and internal tools.

## What You Are Signing Up For

`just-enuf-pm` is intentionally not trying to be Jira, Linear, or some generalized enterprise work-management platform.

The bet here is simpler:

- keep the backend small
- keep the data model understandable
- expose everything through an API
- make it easy to model projects, tasks, dependencies, comments, and lightweight metadata
- leave room for humans and agents to collaborate in the same system

If you want a heavy workflow engine, deep permissions model, or polished enterprise product surface, this is not that.

If you want a hackable PM backend with clear primitives, this is the point.

## Product Decisions

The main design choices are:

- SQLite first
  - simple local deployment
  - easy backup, reset, and inspection
- API first
  - UI is a client, not the source of truth
  - other systems can integrate directly against the backend
- nested projects
  - projects can contain subprojects
  - hierarchy is a first-class concept
- flexible task placement
  - tasks can belong to a project
  - tasks can belong to a parent task
  - tasks can belong to both
- directional dependencies
  - task `B` can be blocked by task `A`
- comments as a message bus
  - comments are not just human notes
  - they are part of the collaboration model between humans and agents
- extensible metadata
  - projects and tasks can carry extra properties without forcing every new idea into the core schema
- soft deletes everywhere
  - destructive cleanup is not the default behavior

## Core Objects

- projects
- subprojects
- tasks
- task types
- dependencies
- comments
- attachments
- notes
- project properties
- task properties
- project repo links
- skill defaults

## What It Is Good At

- internal project and task tracking
- agent-oriented workflows
- lightweight orchestration context for other systems
- local-first development and experimentation
- cases where you want to understand and modify the backend yourself

## What It Is Not Trying To Be

- a full enterprise PM suite
- a multi-tenant SaaS platform
- a strict workflow engine
- a product with a deeply abstracted auth and permissions model
- a system that hides its data model behind a lot of ceremony

## Stack

- FastAPI
- SQLAlchemy
- SQLite

## Quick Start

1. Create a virtual environment and install dependencies:

```bash
uv venv
source .venv/bin/activate
uv pip install -e ".[dev]"
```

2. Initialize the database:

```bash
python -m app.scripts.init_db
```

3. Run the API:

```bash
uvicorn app.main:app --reload
```

4. Open the docs:

- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`

## Scripts

- `python -m app.scripts.init_db`
  - creates the schema and seeds default task type templates
- `python -m app.scripts.reset_db`
  - deletes the SQLite database file and recreates schema plus seed data
- `python -m app.scripts.seed_defaults`
  - reapplies seed data without dropping the database

## Seeded Defaults

The system seeds three global task type templates:

- `Debate`
- `Research`
- `Work`

When a project is created, these defaults are copied into that project as project-specific task types.

## Documentation

- [Architecture](docs/architecture.md)
- [API Notes](docs/api.md)
- [Product Decisions](docs/decisions.md)
