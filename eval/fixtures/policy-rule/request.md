# Feature request: scoped OpenSpec flow policy

The plugin exposes the OpenSpec tools but does not state the workflow gates in
the agent's system prompt. Add an agent-scoped policy section for projects that
contain an `openspec/` root.

## Requirements

1. Add `lib/policy.js` using Node built-ins only. It must export:
   - `POLICY_SECTION = 'openspec-flow:policy'`.
   - `POLICY_TEXT`: a string that states the gates: clarify before proposing;
     state the change name, artifacts and affected code and wait for explicit
     confirmation; do not edit implementation code until the user starts apply;
     apply with `openspec_apply_next` and `openspec_mark_task_done`; validate
     before reporting completion; archive only when the user explicitly asks.
   - `isOpenSpecProject(cwd)`: true only when `cwd` is a non-empty string and
     `<cwd>/openspec` exists.
   - `attachPolicy(ctx, agent)`: attaches one `systemPrompt.section` to
     `agent.ctx` with name `POLICY_SECTION`. Its `text()` returns `POLICY_TEXT`
     when the agent's working directory is an OpenSpec project, and `''`
     otherwise. It must be idempotent per agent.
   - `registerPolicy(ctx)`: registers an `agent/created` listener and attaches
     to every already-live agent from `ctx.agents.list()`. A missing
     `systemPrompt` logs a warning and does nothing.
2. Read the agent's working directory through
   `ctx.workingDirectory.get(agent.session)` and evaluate it inside `text()`,
   so a directory change is reflected without re-registration.
3. Wire the module into `index.js`: add `agents` and `systemPrompt` to
   `inject`, and call `registerPolicy(ctx)` from `apply`.
4. Add tests for the module and update `AGENTS.md`, `README.md`, and
   `skills/openspec-flow/SKILL.md`.
5. Never register a global section; the policy is agent-scoped.

## Workflow

- Create the change as `add-scoped-flow-policy` with a proposal, a spec delta
  for a new `flow-policy` capability, an optional design, and tasks.
- The user confirms the change name before creation and confirms the start of
  apply; do not edit implementation code before that.
- Before reporting completion, run `openspec_validate add-scoped-flow-policy`
  and `node --test test/`, and report both.
