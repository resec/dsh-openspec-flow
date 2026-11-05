# Design: Scoped OpenSpec flow policy

## Context

The plugin currently registers five tools and one skill; it contributes nothing to the system prompt. Whether a session follows the OpenSpec workflow therefore depends on the skill description the model picks in that turn. The user wants the workflow stated as a standing rule, but only in projects that already use OpenSpec.

DSH assembles the system prompt from ordered sections registered per scope. `dsh-system-prompt`'s README states that registering through `agent.ctx` affects that agent alone, and that empty sections disappear. The plugin already injects `workingDirectory`, whose `get(session)` reads the committed directory without filesystem I/O.

## Goals / Non-Goals

**Goals**

- An OpenSpec-project agent sees one short workflow rule in every assembled prompt.
- An agent outside an OpenSpec project sees no additional section at all.
- The rule tracks a working-directory change during the session.
- Agents that already exist when the plugin loads receive the rule.
- The change is additive: no tool behavior, schema, or output changes.

**Non-Goals**

- A write gate or approval flow. This change does not restrict any tool call.
- Forcing a particular skill to load, or removing the upstream skills.
- Changing the global system prompt for non-OpenSpec projects.
- Detecting OpenSpec stores or declared stores; only a local `openspec/` root is recognized.

## Decisions

### Register through the agent's own context

Registration happens in an `agent/created` listener, using `agent.ctx.systemPrompt.section(...)`. The scoped registration is the mechanism that keeps the rule out of other agents; the section is never registered globally.

The section name is `openspec-flow:policy` and its order is `systemPrompt.getSectionOrder('PLAN_POLICY')`, so it sits with the other planning-policy text rather than at an arbitrary position.

If `agent.ctx.systemPrompt` is unavailable, the plugin logs a warning and leaves the tools untouched, matching how `lib/skill.js` treats a missing skill registry.

### Evaluate the directory on every assembly

The section's `text` is a function that reads `workingDirectory.get(agent.session)` and returns `POLICY_TEXT` only when `openspec/` exists under that directory. The agent is captured in the closure because `AssembleContext` carries no agent identity.

Returning an empty string is deliberate: `dsh-system-prompt` drops empty sections, so a project switch produces no blank section and no prompt churn beyond the rule appearing or disappearing.

`existsSync(join(cwd, 'openspec'))` is cached per directory in a small map. The check runs once per assembly and a working-directory change naturally misses the cache.

### Attach once per agent

Both `agent/created` and the load-time sweep can see the same agent. A `WeakSet` of attached agents makes the second path a no-op and keeps the registry free of duplicate section names, which would otherwise throw.

### Sweep existing agents at load time

`ctx.agents.list()` covers agents that were already live when a linked plugin reloaded. The sweep runs once during `apply`, after the event listener is installed.

### Keep the rule short and stage-oriented

The text names the stage gates, not the tool mechanics the skill already documents:

1. Clarify before proposing; do not create a change while the request is ambiguous.
2. Before creating a change, state its name, artifacts, and affected code, and wait for explicit confirmation.
3. Create the planning artifacts, then stop and present them; do not edit implementation code until the user starts apply.
4. Apply with `openspec_apply_next` once, then `openspec_mark_task_done` after each task.
5. Run `openspec_validate` and the project tests before reporting completion.
6. Archive only when the user explicitly asks.

The rule is advisory. It changes what the model is told, not what it is allowed to do; a guard is a separate change.

## Risks / Trade-offs

- The scoped-service semantics are documented but not exercised by this repository's tests. A fake context proves the registration path; the live scope must be checked after installing the plugin. If `agent.ctx` does not proxy the service per scope, the rule would leak globally, which is the exact behavior this change avoids.
- `agents.list()` may be unavailable in a deployment without the agents service. The plugin should treat that as an empty sweep and keep working.
- Subagents receive their own `agent/created` event. A subagent working in the same OpenSpec project also gets the rule; this is acceptable and keeps delegated work consistent.
- The skill catalog remains global: a non-OpenSpec project still lists the `openspec-flow` skill description. Only the body and the prompt section are avoided. Filtering the catalog would require a filesystem provider keyed by project, which is out of scope.
- One `existsSync` per assembly is negligible, and the cache prevents repeated checks for an unchanged directory.

## Migration Plan

None. The change is additive and needs no data or configuration migration. Removing it later means deleting the registration call; no project state depends on the section.

## Open Questions

None.
