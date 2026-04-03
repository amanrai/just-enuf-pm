# Product Decisions

This document records the product choices that shaped the current backend.

## Scope

- This is an API-first workflow system.
- It is not modeled as a SaaS product in v0.
- There is no workspace or organization layer.
- Projects are the top-level container.

## Actors

- There are humans and two agent categories:
  - a single orchestrator
  - worker agents
- Actors are intentionally not first-class records in v0.
- Agent lifetimes are short-lived and turnover is expected to be extremely high.
- Authorship is stored inline as `role` plus `instance_key`.
- The human identity can still be represented as `(human, human)` in authored writes when needed.

## Projects

- Projects can have parent/child relationships.
- A project may exist without a parent project.
- Projects need extensible project-level properties such as repository links.
- Those properties are modeled as a first-class resource rather than hardcoded columns.

## Tasks

- The core work unit is a task.
- Tasks can have parent/child relationships.
- A task must have a parent project, a parent task, or both.
- A task cannot exist without one of those parents.
- A task has at most one parent task.
- Tasks can have multiple dependencies.
- Dependencies may cross project and subproject boundaries.

## Task Types

- Task types are configurable per project.
- New projects receive sensible default task types automatically.
- Current defaults are `Debate`, `Research`, and `Work`.
- Task types are intended to diverge visually and behaviorally.
- Backend rules enforce task type behavior.
- `Debate` tasks cannot participate in dependency edges.

## Statuses

- v0 uses a shared task status vocabulary:
  - `Unopened`
  - `In Planning`
  - `In Execution`
  - `Ready For Human Review`
  - `Human Reviewed and Closed`
  - `Closed without Human Review`
- The backend validates allowed status values.
- The backend does not enforce transition rules.
- Orchestration stays outside this service for now.

## Dependencies

- The only dependency relationship is: task `B` is blocked by task `A`.
- Dependency cycles are forbidden by the backend.
- Recursive blocker queries are first-class.
- The `depth` parameter works as:
  - `0` for direct blockers
  - positive integers for bounded traversal
  - `-1` for the full transitive blocker tree
- The same depth pattern is used for project and task child traversal.

## Comments

- Comments are a core requirement.
- The comment thread is intended to act as the message bus for collaboration.
- Comments belong to either a task or a project.
- A unified comment model is used for both resources.
- Comments support replies through `parent_comment_id`.
- Top-level comments are allowed.
- Human comments are marked specially.
- Comment bodies are markdown and expected to support Mermaid rendering in clients.

## Deletion

- There is no hard delete in v0.
- All deletion is soft deletion.

## Storage

- SQLite is the v0 database.
- The code is structured to stay modular and extensible as requirements evolve.
