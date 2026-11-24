# Change: add-land-stage-to-review-session

## Why

The scheduled PR review watch only reviews. A pull request that already carries the maintainer-applied `mergeable` label is skipped by `poll` because its head is `commented`, so no session ever calls the landing command and labeled pull requests stay open indefinitely. The landing stage cannot move to a separate short-lived session: the apply review record binds the independent reviewer subagent to the session that started it, and a new session cannot resume that reviewer.

## What Changes

- Add a read-only `candidates` command to `scripts/pr-review-land.mjs`. It reports open pull requests that carry `mergeable`, have a matching `commented` watch entry and satisfy every landing gate, plus the first refusal reason for the others. A dirty main worktree is reported once for the whole listing instead of once per pull request.
- Document one fixed DSH session that runs every five minutes: review candidates, the landing stage, and the archive-and-push stage, one phase per run. The session keeps the same target session across runs so the independent reviewer remains resumable.
- Require the final landing review to use `openspec_review action=resume` on the recorded apply review, not `start`. When the resume fails, the session records the failure and stops; it does not call `replace` and does not move to another session.
- Keep the watch script read-only: `poll` still lists review candidates only, and the landing command still performs every git and GitHub write.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-pipeline`: replace the ten-minute new-session schedule with the fixed five-minute session, add landing candidate discovery, and require the final review to resume the same reviewer.

## Impact

- `scripts/pr-review-land.mjs`: new read-only `candidates` command, new `state --fail <n> --error <text> --apply` command, and the `review-failed` landing phase.
- `docs/pr-review.md`: commands, Schedule, Landing and State sections.
- `AGENTS.md`: scheduled-session description.
- `test/pr-review-land.test.mjs`: gate matrix for the new command, the phase recording and the abandon-then-candidate sequence.
- No change to the watch script's review behavior, plugin tools, review record schema or label ownership.
