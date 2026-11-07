# Design

## Context

See `proposal.md` - Why.

The bundled OpenSpec 1.16.0 CLI has no `sync` command. `archive` is the only command that merges delta specs into main specs, and it always moves the change. The package has an internal `dist/core/specs-apply.js` module extracted "to enable standalone spec application", but it is not a CLI command and not in the package's `exports`; using it would couple the plugin to an internal file across CLI upgrades.

The upstream project also ships an `openspec-sync-specs` skill that defines the operation as agent-driven: the model reads delta specs and edits main specs directly. That skill is a manual procedure, not an archive-equivalent merge; it explicitly contrasts "intelligent merging" with programmatic merging.

Our skill is a shorter version of that procedure. It cannot enforce the CLI merger's delta validation, conflict rules, scenario-loss checks, early-sync idempotency or rollback, and it contradicts the flow policy's rule that every workflow step goes through an `openspec_*` tool.

## Goals / Non-Goals

- Goal: remove the unsupported manual flow rather than keep a misleading half-support.
- Goal: make the unsupported boundary explicit in the policy, the specs and the docs.
- Goal: leave a migration path for stale project and evaluation copies.
- Non-goal: add a sync-only tool, deep-import `specs-apply`, or reimplement the merger.
- Non-goal: change the archive behavior, the tool count, or the archive merge semantics.

## Decisions

### Remove the skill instead of fixing it

The manual procedure cannot be made archive-equivalent without the CLI merger, and the plugin deliberately does not reimplement CLI semantics. Fixing the skill would keep an unsupported operation visible and continue to conflict with the policy. Removing it makes the boundary honest; users who need main specs updated must finish and archive the change.

Alternative considered: keep the skill as a manual fallback and document its limits. Rejected because the policy already says to stop when a tool is missing, and a documented "best effort" still presents the flow as available.

Alternative considered: add a sync-only tool through the internal module. Rejected for this change: it reverses the explicit decision to stay on the supported CLI surface and would require a separate spec change.

### Encode the boundary in three layers

The README explains the status, the flow policy enforces it at prompt assembly, and the specs make it a contract. Documentation alone is not enough because the model can still follow a stale project copy of the skill; the policy rule says not to load it, and the `tool-surface` requirement prevents a future contributor from adding a sync-only tool without a spec change.

### Do not delete stale copies automatically

The provider runs at rank 50, below project `.dsh/skills` (100) and `.agents/skills` (200). Once the packaged skill is gone, a project copy is no longer shadowed and would be visible again. `openspec_init` must not delete user files silently, so the migration is explicit: the README names the stale path and the policy refuses to follow it. The separate `dsh-openspec-flow-eval` repository removes its own copy.

### Bump the plugin version

Removing a packaged skill is a breaking catalog change. The version moves to `0.2.0`; the five remaining skills carry `metadata.generatedBy: dsh-openspec-flow@0.2.0`, and `package-lock.json` carries the same root version.

## Risks / Trade-offs

- [Users lose the only in-plugin way to update main specs early] → the supported path is to finish and archive the change; the policy and README say so.
- [A stale project copy is still loadable] → the policy explicitly refuses it and the README names the path to delete.
- [Tests and docs still assume six skills] → the task list updates every count and adds a removal assertion.
- [The main specs and code disagree until the change is archived] → the change's delta specs are the source of truth during apply; archive merges them.

## Migration Plan

1. Delete `skills/openspec-sync-specs/SKILL.md` and the empty directory.
2. Remove the name from `SKILL_NAMES`; update the provider tests and the `index.js` header.
3. Add the policy rule and its test assertions.
4. Update the README, `AGENTS.md`, and the stale-copy instructions.
5. Bump the version and the five skill stamps.
6. Run `openspec_validate`, `npm test` and `npm run coverage:check` on Node 24.
7. Archive the change, commit the archive and docs, and push to `origin/main`.
8. Remove the stale copy from `dsh-openspec-flow-eval` and reload the linked plugin.

Rollback: restore the deleted skill, the six-skill list, the old policy text, the docs and the version; the archive is a separate commit and can be reverted first.

## Open Questions

None.
