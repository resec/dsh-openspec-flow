# Proposal: Share review records across worktrees

## Why

Apply review will run in a per-change worktree, while archive and the client stay on the main worktree. Records stored under a worktree-local `openspec/.review/` are invisible to the other worktrees, so the main worktree cannot see the apply review that gates archive. The record store must move to a location shared by every worktree before apply worktrees are introduced.

## What Changes

- A git project stores review records at `<git common dir>/openspec-flow/review/<store>#<change>/`; `local#<change>` remains the name when no store is selected.
- A nested OpenSpec root appends a stable root suffix to the record name so two nested roots with the same change name do not share a record.
- A project without git keeps the existing `openspec/.review/<store>#<change>/` root.
- A legacy record at the old root is read and copied to the shared root once; a per-record migration marker prevents a removed shared record from being restored from the retained legacy copy.
- Review record resolution, the client card path, settings policy listing and the review documentation use the shared root for git projects; cards under the legacy root remain visible until their record is copied.
- The legacy root keeps its `openspec/.gitignore` and root `.gitignore` behavior; the shared root lives outside the worktree and needs no ignore rule.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: move the review record root to the git common directory for git projects, add the nested-root identity, keep the legacy root for non-git projects, and add legacy read and one-time copy behavior.
- `review-documentation`: document the shared root, the legacy root, the one-time copy, the card and lock layout, and the retained legacy ignore entry.
- `review-cards`: keep cards written under the legacy root readable until their record is copied.
- `development-workflow`: keep the legacy root ignored in the repository root `.gitignore` while stating that the shared root is outside the worktree.

## Impact

- Review record resolution in `lib/review/store.js`; every caller that already uses `reviewDirectory` and `reviewRoot`.
- Settings policy listing and client card reads that resolve the review root.
- Tests that create or assert `openspec/.review/` paths; the review fixtures helper and the review documentation test.
- `README.md`, `docs/review.md`, and `CONTRIBUTING.md` statements about the record root.
- No new dependency, no runtime path outside the repository's git directory, and no change to report, finding or readiness semantics.
