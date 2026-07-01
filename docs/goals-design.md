# Goals Design Notes

This document captures the current product/design discussion for introducing a new `Goal` entity to `just-enuf-pm`.

This is discovery/design only. It is not an implementation plan yet.

## High-Level Concept

A `Goal` is a first-class planning/work entity that sits above tickets/tasks conceptually, but is not strictly contained by a single project.

Goals are usually outcomes, but can also represent specific deliverables or milestones. Smaller deliverables or milestones may function as supporting goals.

Goals are intended to be useful in a multi-agent system where multiple agents may work toward several goals at once while updating multiple underlying tasks/tickets with progress.

## Relationship to Projects and Tasks

A Goal is at roughly the same organizational level as a Project, but it can conceptually cut across Projects.

Goals should not have direct links to Projects in the initial model. Project association should be inferred by agents through the tasks/tickets they update while working toward a Goal.

The initial database design should stay minimal: Goals and their checklist items. Task-to-goal association can emerge from agent behavior and existing ticket updates rather than from an explicit GoalTaskLink table in the first schema.

The agent system is expected to work from a Goal as higher-level context and update multiple underlying tasks/tickets as needed.

## Goal-to-Goal Relationships

Goals should form a graph, not a strict tree.

The initial intuition was that Goals might have sub-goals, but a supporting smaller goal may orient toward multiple larger goals. Therefore, strict parent/child containment is too limiting.

Goal-to-Goal relationships should be included in the first implementation. Even though the broader design should remain simple, the initial product surface should support goal relationships from the start because checklist items can graduate into sub-goals and Goals may need to express support/dependency relationships.

If goal relationships are introduced later, `supports` and `depends_on` should be treated as complementary/inverse ways to view the same relationship, not as two separate stored relationship types. If Goal A supports Goal B, then Goal B depends on Goal A. Only one direction should be expressed canonically in the database/API, with the inverse derived for display/query convenience. The specific canonical direction does not matter from a product perspective; either `supports` or `depends_on` is acceptable as an implementation choice.

The `blocks` relationship should not be included for now. The reasoning is that even when one goal depends on another, progress can generally still be made on smaller parts of the larger goal.

Cycle prevention and strict graph enforcement should not be designed yet. Let usage evolve first.

## Goal Completion

A Goal has a simple done/not-done state.

In the database, completion should be represented with both `is_done` and `completed_at`. `is_done` should default to `false`.

A Goal should be allowed to be marked done even if some checklist items are not done. Goal completion is manually controlled and is not derived automatically from checklist completion.

There should not be a richer Goal status vocabulary yet. Rejected examples include:

- open
- in progress
- paused
- abandoned

If a Goal no longer belongs, it can be deleted rather than moved into a special abandoned/paused state.

## Goal Checklist

Each Goal comes with a checklist.

Checklist items are deliberately simple. Each checklist item is a container with:

- a required title
- an optional description
- a done/not-done state
- a completion timestamp
- a display index/order
- comments

Checklist item descriptions should stay semantically flexible. They may describe a task, guideline, milestone, constraint, acceptance criterion, research point, or something else. The system should not impose additional structure at this stage.

Checklist items are not intended to be workflow steps that an agent must execute in sequence. They are containers that can be checked off and discussed.

Agents may create, read, update, and delete checklist items.

Checklist item display order should be stored as a simple integer settable by the frontend, but it is only a presentation preference. It should not imply internal execution order or dependency semantics. The database should not require `display_order` and should not enforce uniqueness per Goal; application logic can manage ordering.

Each checklist item belongs to exactly one Goal via `goal_id`. Checklist items are not shareable across Goals in the initial design.

A checklist item should be able to be graduated into either a sub-goal or its own top-level Goal. Graduation is distinct from the UI's separate "duplicate as Goal" action. Duplication may leave the original checklist item in place, but graduation should conceptually move/convert the checklist item rather than create an unrelated copy.

## Checklist Item Comments

Each checklist item can support comments from both humans and agents.

These comments are important because checklist items are containers for collaborative progress, interpretation, and updates.

Checklist item comments should be included in the initial implementation. Prefer reusing/extending the existing comment system so comments remain a common concept across projects, tasks, and goal checklist items.

## Agent Interaction

Agents can CRUD Goals.

Agents can CRUD Goal checklist items.

Agents working on a Goal may update multiple tasks/tickets with progress.

Whether an agent writes Goal-level progress checkpoints or summaries should be left to the agent, guided later by lightweight skill instructions rather than by database structure.

The Goal layer is intended to become a higher-level operating context for agents, rather than simply a label attached to tasks.

## Ordering and Views

Goals do not need intrinsic ordering or display rank.

In a multi-agent system, multiple Goals may be active at once. Over time, what matters is how the user chooses to view/filter/sort them, not a built-in global ordering.

Checklist items do have a display index, but only for user presentation.

## Database Design Decisions So Far

The first database version should include the full initial Goal surface:

- Include `Goal`, `GoalChecklistItem`, `GoalActivityEvent`, and `GoalRelationship`.
- Include checklist item comment support.
- Include checklist item graduation support.
- Include strong search support.
- Do not include direct Goal-to-Project links.
- Do not include Goal-to-Task link tables yet.
- Let agents infer and express cross-ticket Goal work through their updates to existing tickets/tasks.
- Include a Goal activity log so the API can answer what was worked on, updated, finished, deleted, or otherwise changed by time.
- Do not include actor/authorship fields for Goals or checklist items.
- Activity events should carry actor information; this is the right place to record who/what caused a Goal-surface change.
- Every activity event must have actor information.
- Use soft deletes only.
- Soft delete should use both `is_deleted` and `deleted_at`.
- Soft-deleting a Goal effectively hides/deletes its checklist through the parent relationship. Checklist item visibility can be determined by joining to the Goal.
- Do not cascade physical deletes from Goal to checklist items.
- The foreign key should restrict/prevent physical deletion of a Goal while checklist items reference it.
- Both Goals and checklist items should have `created_at` and `updated_at`.
- Editing restrictions for soft-deleted rows should be handled in application logic, not database triggers/constraints.
- Required titles should be enforced by the database as non-empty, non-whitespace-only strings.
- `description_md` should be nullable.
- Application logic should keep `is_done` and `completed_at` in sync: set `completed_at` when `is_done` becomes true, and clear it when `is_done` becomes false.
- Checklist items should support graduation into a sub-goal or top-level Goal. Graduation is separate from duplication-as-Goal and should be treated as moving/converting the item, not merely copying it.

## API Design Draft

The Goals API should include basic CRUD for Goals and their checklist items, checklist item comments, checklist item graduation, Goal-to-Goal relationships, explicit calls for time-based activity, and strong search.

### Basic Goal CRUD

Proposed endpoints:

- `GET /api/goals`
  - List active Goals by default.
  - Return compact Goal records only, without checklist items.
  - Likely query params: `include_done`, `include_deleted`, `done`, `updated_since`, `created_since`, `q`.
- `POST /api/goals`
  - Create a Goal.
  - Payload: `title`, optional `description_md`, optional initial checklist items, required `actor_role`, required `actor_instance_key`.
- `GET /api/goals/{goal_id}`
  - Read one Goal, including checklist items by default.
- `PATCH /api/goals/{goal_id}`
  - Update `title`, `description_md`, and completion fields.
  - Payload should include required `actor_role` and required `actor_instance_key` for activity logging.
  - Application logic should keep `is_done` and `completed_at` in sync.
- `DELETE /api/goals/{goal_id}`
  - Soft-delete a Goal.

### Expanded Goal Listing

There should also be a separate call that returns Goals with their full related Goal data, including checklist items.

Proposed endpoint:

- `GET /api/goals/full`
  - Return Goals plus checklist items.
  - Support filtering and ordering by various Goal and checklist-derived fields.
  - Intended for richer UI/agent views where clients want the whole Goal surface in one call.
  - First-class ordering should include created time, updated time, and worked-on time.

Ordering semantics:

- `created`: based on the Goal's own `created_at`.
- `updated`: based on any change to the Goal surface, including Goal title/description edits, completion changes, checklist item creation/update/completion/deletion, comments, and other future Goal-associated changes.
- `worked_on`: specifically reflects activity on checklist items. This is the checklist-derived notion of recent work, distinct from a direct edit to the Goal's metadata.

This is separate from `GET /api/goals`, which remains a compact list endpoint.

### Checklist Item CRUD

Proposed endpoints:

- `GET /api/goals/{goal_id}/checklist-items`
- `POST /api/goals/{goal_id}/checklist-items`
- `GET /api/goal-checklist-items/{item_id}`
- `PATCH /api/goal-checklist-items/{item_id}`
- `DELETE /api/goal-checklist-items/{item_id}`

Checklist item payloads should support `title`, nullable `description_md`, `is_done`, `completed_at`, nullable integer `display_order`, required `actor_role`, and required `actor_instance_key` for mutating operations.

### Checklist Item Graduation

Checklist items should support explicit graduation actions:

- `POST /api/goal-checklist-items/{item_id}/graduate`

The graduation endpoint should be able to create either:

- a top-level Goal, or
- a sub-goal / related Goal using the initial GoalRelationship model.

Graduation is conceptually a move/convert operation, not the same as duplicating an item into a Goal. The UI may also expose a separate duplicate-as-Goal action, but that should be a separate API behavior.

### Time-Based Activity APIs

There should be explicit calls to see what has been worked on, updated, finished, deleted, or otherwise changed by time.

This should be backed by a real Goal activity/event log, not only computed from row timestamps. This is necessary because `updated` means any change across the Goal surface: Goal edits, checklist item changes, completion changes, comments, and future Goal-associated changes.

Proposed endpoints:

- `GET /api/goals/activity`
  - Cross-Goal activity feed.
  - Query params may include `since`, `until`, `event_type`, `goal_id`, `limit`, `cursor`.
- `GET /api/goals/{goal_id}/activity`
  - Activity feed scoped to one Goal.
- `GET /api/goals/updated`
  - Convenience endpoint for Goals/checklist items updated within a time range.
  - Query params: `since`, `until`, `include_checklist_items`.
- `GET /api/goals/finished`
  - Convenience endpoint for Goals/checklist items completed within a time range.
  - Query params: `since`, `until`, `include_checklist_items`.

The activity API should be excellent for agents: easy to ask "what changed since timestamp X?", "what got finished yesterday?", and "what work happened under this Goal?" without composing many generic list calls.

Activity log events should support deriving:

- `last_updated_at`: latest event affecting the Goal surface.
- `last_worked_on_at`: latest event representing checklist-item work.
- time-window activity feeds.
- finished/deleted/created/updated summaries.

Any event that can occur with a Goal should be representable in the activity log. The event model should not be limited to a tiny fixed set that only covers CRUD. Initial implementation may define known event type constants, but the design should allow the event vocabulary to grow as Goal capabilities grow.

Activity events should be produced by Goal/checklist/comment/etc. API operations, not directly created by frontend clients. There is no need to expose direct arbitrary activity-event creation to clients.

Because activity events require actor information while Goals and checklist items do not store actor fields directly, every mutating Goals API payload should include `actor_role` and `actor_instance_key`. The service layer uses those payload fields to write the corresponding activity event.

### Search API

Goals need an excellent search function in the initial implementation.

Proposed endpoint:

- `GET /api/goals/search`

Initial searchable fields:

- Goal `title`
- Goal `description_md`
- Checklist item `title`
- Checklist item `description_md`

Likely query params:

- `q`: required search string
- `include_done`
- `include_deleted`
- `updated_since`
- `completed_since`
- `limit`
- `cursor`

Search results should make clear why a result matched, e.g. whether the match was on the Goal itself or one of its checklist items.

## Open Questions

These questions remain unresolved and should be answered before implementation design:

1. Should Goals support tags?
2. Should Goals support arbitrary properties/metadata like Projects and Tasks?
3. Should a Goal itself have a comment thread, separate from checklist item comments?
4. Should Goals support attachments/notes?

## Current Tentative Shape

Conceptually, the emerging shape is:

```text
Goal
  - id
  - title (required, non-empty/non-whitespace)
  - description_md (nullable)
  - is_done (default false)
  - completed_at (nullable)
  - is_deleted
  - deleted_at
  - created_at
  - updated_at

GoalChecklistItem
  - id
  - goal_id (required FK to Goal, no delete cascade; restrict physical Goal deletion)
  - title (required, non-empty/non-whitespace)
  - description_md (nullable)
  - is_done (default false)
  - completed_at (nullable)
  - display_order (nullable integer; frontend/application managed)
  - is_deleted
  - deleted_at
  - created_at
  - updated_at

GoalActivityEvent
  - id
  - goal_id (required FK to Goal)
  - checklist_item_id (nullable FK to GoalChecklistItem)
  - event_type (required; extensible string vocabulary)
  - occurred_at
  - actor_role (required)
  - actor_instance_key (required)
  - summary (nullable)
  - data_json (nullable)

GoalRelationship
  - id
  - source_goal_id (required FK to Goal)
  - target_goal_id (required FK to Goal)
  - relationship_type (single canonical supports/depends_on direction; inverse is derived)
  - is_deleted
  - deleted_at
  - created_at
  - updated_at
```

This is not final. It is a working sketch to preserve the design conversation.
