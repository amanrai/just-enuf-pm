# PM System

API-first workflow management system for projects, tasks, dependencies, and comments.

## Stack

- FastAPI
- SQLAlchemy
- SQLite

## Core Concepts

- Projects can be nested.
- Projects can have extensible project-level properties such as repository URLs.
- Tasks can belong to a project, a parent task, or both.
- Tasks can depend on many other tasks.
- Task dependencies are directional: task `B` can be blocked by task `A`.
- Comments form the message bus for humans and agents.
- Authorship is recorded inline as `role + instance_key`, not as a durable actor registry.
- Task types are configurable per project and seeded with sensible defaults.
- Deletes are soft deletes everywhere.

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
  Creates the schema and seeds default task type templates.
- `python -m app.scripts.reset_db`
  Deletes the SQLite database file and recreates schema + seed data.
- `python -m app.scripts.seed_defaults`
  Reapplies seed data without dropping the database.

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
