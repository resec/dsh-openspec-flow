# Proposal: Define the labeled landing duties once

## Why

Two capabilities each define how a labeled pull request lands: `Label-authorized pull-request landing` in `contributor-workflow` and `Labeled pull-request landing` in `development-workflow`. The first carries the full duty set; the second restates the merge and tree rule with a narrower prohibition list, so it omits several duties a reader of that capability would rely on (it never forbids adding or removing `mergeable`, squashing, forcing, creating a merge commit on `main` or touching a fork branch).

Both describe `scripts/pr-review-land.mjs`, which implements the larger set. A duplicated requirement that is a strict subset of another one invites drift: an edit to one copy leaves the other silent, and the subset reads as permission for the omitted actions.

## What Changes

- Keep `Label-authorized pull-request landing` in `contributor-workflow` as the single definition. Its duty set is already the union of both requirements and every duty in it is implemented, so its text is unchanged.
- Remove `Labeled pull-request landing` from `development-workflow` through a `REMOVED` delta. Its Reason names the subset and its Migration points a landing session at the contributing definition; a modified block cannot drop the two scenarios that restate the duties.
- No implementation change: `scripts/pr-review-land.mjs` already merges with `gh pr merge --rebase`, writes no label, refuses a cross-repository branch in `sync`, and `scripts/push-landed.mjs` pushes without force.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: the duplicate `Labeled pull-request landing` is removed; `Label-authorized pull-request landing` in `contributor-workflow` stays the only definition.

## Impact

- `openspec/specs/development-workflow/spec.md`: through the delta; one requirement is removed.
- `openspec/specs/contributor-workflow/spec.md`: unchanged; it already holds the definition.
- No code, test, documentation or plugin-surface change. `docs/pr-review.md`, `CONTRIBUTING.md` and `AGENTS.md` already describe the larger duty set and stay accurate.
