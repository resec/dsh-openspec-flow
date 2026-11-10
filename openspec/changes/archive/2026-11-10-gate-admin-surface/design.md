# Design: gate-admin-surface

## Context

- The plugin registers 13 tools through `ctx.tools.register` on the profile-level plugin context, so every agent sees all of them.
- DSH 0.2.2-rc.1 supports `ToolRegistrationOptions.when`, a step-time predicate evaluated per agent while the request's tool set is resolved. A hidden tool is excluded from both the model schema and dispatch.
- `ctx.commands.register` provides human-only commands; the handler receives the exact `Agent` and never reaches the model as a tool.
- The plugin may not import `@deepseek-ai/*` packages at runtime because a linked profile install cannot resolve them.
- Packaged skills have no per-agent gate in this change; see `proposal.md`.

## Goals / Non-Goals

Goals: the three management tools are absent from the model catalog unless the block is open; no model-facing path opens it; the block ends with the turn and is never persisted; a host without a command registry keeps the previous always-visible behavior.

Non-Goals: per-stage exposure, tool consolidation, new store/workset write tools, gating any of the five packaged skills. Those are separate changes.

## Decisions

### Gate through `when` on the existing registrations

Keep the global registrations and pass `{ when: ({ agent }) => isAdminOpen(agent) }` for the three management tools. This needs no re-registration, no per-agent scope setup, and no duplicate-name handling, and the hidden tool is already excluded from both `schemas()` and `executable()`.

Alternative: register the management tools on `agent.ctx` when the command runs and dispose them on close. It reaches the same behavior but adds per-agent lifecycle bookkeeping and a second place where registrations can leak.

### Keep the block state in memory, keyed by Agent

A module-level `WeakMap<Agent, { running: boolean }>` holds the open block. The block lives for one turn, and a resumed or forked session must start closed, so persisting it in a session projection would encode the wrong lifetime.

Alternative: fold `command/run` into a projection so the block survives resume. Rejected because resume must reset it.

### Open on the command, close on the idle transition

`/opsx-admin <intent>` sets the entry and steers the intent as the user request. The plugin listens to `agent/status`; it records that the agent has been `running`, and closes the block on the following `idle`. The `running` marker prevents the idle transition that can immediately follow the command from closing the block before the turn starts.

Alternative: close on the `turn/end` session event. Equivalent, but `agent/status` is a process-local signal the plugin can subscribe to without depending on the session log.

### Require an intent, and build the steered message locally

`/opsx-admin` without an argument returns a usage error instead of leaving the block open for a later unrelated turn. `/opsx-admin off` closes it early. The intent is submitted as a frozen user message built with the documented `UserMessage` shape (`id`, `role`, `content`, `source`) and `node:crypto` for the id, the same pattern another linked-profile plugin uses, because importing the platform helper would break the install.

Alternative: open without an intent and let the next user message use the block. Rejected because an unrelated next message would silently get management tools.

### Command name `opsx-admin`

DSH parses command names with `[a-z][a-z0-9_-]*`, so a colon (the OpenSpec spelling `/opsx:apply`) is invalid. `opsx-admin` also avoids the bare `openspec` token that the skill test guard rejects.

### Fail open when the command registry is absent

If `ctx.commands` is missing, register the three tools without `when` and log one warning. A host that cannot open the block must not lose the capability.

### Skills stay in the core block

All five packaged skills remain model and user invocable, and the provider is unchanged. When a management skill is added later, it must be registered per agent and disposed when the block closes; this change records that boundary in the `skill-provider` delta but implements nothing for it.

## Risks / Trade-offs

- Every open and close changes the request header and loses the cached prompt prefix → the block is only about 1,037 schema characters, so this trades a rare double cache miss for a per-request saving; the proposal rejected per-stage gating for the same reason.
- The model may look for `openspec_init` or `openspec_schemas` and find nothing → the policy and the three shipped skills name `/opsx-admin` and tell it to ask the user.
- A command can run while a step is already in flight → the current step keeps its resolved set; the next step sees the new block, and the idle close still applies.
- An idle event can arrive right after the opening → the `running` marker gates the close.
- A host without `ctx.commands` never closes the block → the fail-open branch keeps the old behavior instead of hiding the tools forever.

## Migration Plan

No data migration. After upgrade the three management tools are hidden until `/opsx-admin` is used; the README, the flow policy and the shipped skills describe the command. Rollback removes the `when` options and the command registration, restoring the always-visible surface.

## Open Questions

None.
