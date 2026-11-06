# Design: Remove the CLI fallback promise

## Context

See `proposal.md` — Why. Two constraints shape the approach: the runtime resolves only the bundled `@fission-ai/openspec` 1.16.0 and never consults `PATH`, a project `.bin`, or `cliPath` (`lib/openspec.js:5`, `lib/openspec.js:101`, `index.js:58`); and six skills are copied into a project's `.dsh/skills`, where their text outlives the plugin installation. The `openspec-flow` skill is registered at runtime instead.

## Goals / Non-Goals

Goals: one consistent statement — the plugin provides no CLI fallback, a missing tool is reported — across the policy, the seven skills, the two specs and the tests, with a guard that fails when a fallback sentence returns.

Non-Goals: changing tool schemas, CLI resolution or the pinned version; removing CLI mentions that describe a capability boundary rather than a fallback.

## Decisions

### Remove the sentence, do not reword it

Alternative considered: keep the fallback but point the agent at the bundled CLI. Rejected: the install path differs per profile, the plugin exposes no stable command, and a path instruction would leak an install detail into agent-facing text. Reporting the missing tool is the only accurate behavior.

### Keep boundary mentions

The `update`-command distinction in `openspec-update-change` and the `spec-driven` schema limit in `openspec-flow` describe semantics, not a fallback. Removing them would drop information the agent needs to disambiguate a user request or refuse a custom schema.

### Replace the requirement instead of renaming it

`MODIFIED` requires the existing header, and `RENAMED` changes only the name. The old requirement's name and content both promise a fallback, so each delta `REMOVED` block carries the old requirement with a reason and migration, and an `ADDED` block introduces "Skills use tools and report missing tools" and "Skills state no CLI fallback". The obsolete blocks leave the main specs at archive time.

### Two guards, one rule

`test/skills.test.mjs` checks every packaged skill; `test/policy.test.mjs` checks `POLICY_TEXT`. Both require the no-fallback statement and reject `/fall back/i`, so a reintroduction fails before packaging.

### Sync installed copies through `openspec_init`

The six project copies carry the current plugin version but an older hash. `installSkills` backs up and rewrites them, keeping `.dsh/skills` byte-identical to `skills/`.

## Risks / Trade-offs

- A project keeps the old skill text until `openspec_init` runs → covered by the change's sync task and the existing migration note in `README.md`.
- A live session keeps the old policy text until the plugin reloads → the section is agent-scoped and rebuilt during prompt assembly; restart or re-enable the plugin.
- The eval repository keeps its own `.dsh/skills` snapshot → out of scope here; resync it before the next evaluation run.

## Migration Plan

1. Land the text, the spec deltas and the tests.
2. Run `npm test` and `npm run coverage:check` on Node 24.
3. Run `openspec_init` per project to rewrite the six skills after a backup.
4. Rollback: `git revert`; the timestamped backup under `.dsh/openspec-flow-backup/` restores the previous skill text.

## Open Questions

None.
