# Proposal: Rebase extra review rounds and land cleanup

## Why

When main moves ahead, land refuses a plugin worktree that is behind main and asks for a rebase, retest and re-review. That second review is a recovery review of a rebased tree, but the plugin records it as the next normal round, so the normal round sequence no longer reflects the original review and later fix rounds inherit an inflated number. Land also leaves the worktree and its local branch behind after a successful merge, so every landed change keeps a stale checkout and branch until someone removes them by hand.

## What Changes

- Land records a rebase-review marker on the change's apply review when the worktree is behind main: `rebaseReview` carries the required time, the pre-rebase worktree head and the reviewed tree. The marker is written under the review-directory lock after the change-lock owner is verified. Other land refusals write no marker.
- While the marker is present, `openspec_review` with `action: "resume"` and `review: "apply"` opens an extra round instead of a normal round. Extra rounds are stored in a separate `extraRounds` array, numbered `E1`, `E2`, and so on, and never advance the normal `rounds` length or the normal round number.
- Extra rounds reuse the report, finding, disposition, waiver, readiness and wakeup contract across `openspec_review` and `openspec_reviewer`. Finding ids may be `R<round>-NN` or `E<n>-NN`; the report contract, briefs, cards and status show the token for the round being reviewed.
- A ready extra round leaves the marker in place so land can bind its tree. Land uses the ready extra round's `treeSha` as the required tree and clears the marker inside the land critical section after the merged-tree check. When the rebased tree equals the tree already reviewed, resume clears the marker without opening a round and the reviewed tree stays the required tree.
- `openspec_review` round arguments accept a normal round number or an extra round token such as `E1`; the tool result keeps the numeric `round` and adds `roundToken` and `extraRounds`, with the output schema updated for Host validation. The reviewer tool accepts the same round forms.
- Review cards for an extra round carry the shared numeric round sequence and the token in the payload, so ordering and Host validation keep working.
- A successful land removes the landed worktree and its local branch inside the same lifecycle critical section, keeps the archived state and the landed manifest, and records `cleanup` on the state. A failed cleanup keeps the `archived` state, reports a warning with the error, and a later land retries only the cleanup without merging or archiving again.
- Worktree inspection treats an archived state with a completed cleanup as healthy instead of reporting a missing worktree as a manual repair; an archived state with pending cleanup, including a legacy archived state whose worktree still exists, names the cleanup retry.
- `openspec_apply_worktree` land results report the cleanup outcome.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: rebase-review marker, extra apply review rounds, extra round ids and readiness, land binding and marker clearing, extra round status and wakeup.
- `apply-worktree`: land writes the rebase marker, state carries `cleanup`, land removes the worktree and branch, a failed cleanup stays resumable, a cleanup retry skips the merge preconditions, and inspection understands the cleaned state.
- `tool-surface`: `openspec_review` and `openspec_reviewer` round arguments accept extra round tokens, review results declare extra rounds, and the land result carries cleanup facts.
- `review-cards`: an extra round card carries the shared sequence and the token, and ordering uses the sequence.

## Impact

- `lib/tools/review.js`: resume dispatch between normal and extra rounds, round token parsing for every review action, output schema, report and status for extra rounds.
- `lib/review/reviewer-tool.js`: brief, status, findings, own-report and submit round resolution for extra rounds.
- `lib/review/`: brief round rendering, finding id validation, readiness, cards and card settings for extra rounds.
- `lib/worktree/land.js` and `lib/worktree/state.js`: rebase marker write under the review lock, cleanup steps, cleanup retry, state fields.
- `lib/tools/worktree.js` and `lib/tools/query.js`: land result and inspection projection.
- `test/`: review round, reviewer tool, cards, schema, land and inspection regressions.
- `docs/review.md`, `docs/apply-worktree.md`, `README.md`, `AGENTS.md`, the shipped skills and `lib/policy.js`.
- No new dependency; existing records without `extraRounds`, `rebaseReview` or `cleanup` keep working.
