# API Notes

## Main Resources

- `/healthz`
- `/projects`
- `/project-properties`
- `/task-types`
- `/tasks`
- `/comments`

## Important Query Patterns

### Task blockers

`GET /tasks/{task_id}/blockers?depth=0`

- `depth=0` returns direct blockers
- `depth=2` returns blockers up to 2 hops away
- `depth=-1` returns the full blocker tree

### Task children

`GET /tasks/{task_id}/children?depth=0`

### Project children

`GET /projects/{project_id}/children?depth=0`

### Project-scoped convenience routes

- `GET /projects/{project_id}/tasks`
- `POST /projects/{project_id}/tasks`
- `GET /projects/{project_id}/subprojects?depth=0`
- `POST /projects/{project_id}/subprojects`
- `POST /projects/{project_id}/parent`

## Comment Model

Comments support:

- project-level comments
- task-level comments
- replies via `parent_comment_id`
- markdown content with Mermaid support handled by the frontend

## Authorship

Writable resources record authorship inline using:

- `role`
- `instance_key`

There is no first-class actor registry in v0.

## Project Properties

Project properties are generic key/value entries attached to a project.

Example uses:

- code repository URL
- deployment URL
- documentation URL
