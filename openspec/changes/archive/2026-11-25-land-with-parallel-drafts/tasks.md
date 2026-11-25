# Tasks

## 1. Worktree guard split and sync relaxation

- [x] 1.1 Add `assertOnMain` and `assertLandingReady` to `scripts/pr-review-land.mjs`, import `filterUnrelatedChangeStatus`, and move `plan`, `prepare` and `merge` to the filtered guard; verify `node --test test/pr-review-land.test.mjs` passes and new cases show another change's directory tolerated while the landing change's own directory, a path outside the changes tree, a staged index and a non-`main` HEAD are refused, with a staged-index `merge` refusal leaving the entry at `reviewed`
- [x] 1.2 Move `candidates` to the branch check plus a real-dirt-only status filter, and verify tests show another change's planning directory lists the candidates while `?? notes.txt` still reports `blocked` once and lists nothing
- [x] 1.3 Move `sync` and `sync-batch` to the branch check only, keeping the landing-lock and local-`main`-ahead gates, and verify tests show a dirty main worktree syncs and batches while a non-`main` HEAD still refuses
- [x] 1.4 Add the tolerance and sync-relaxation sentence to the `AGENTS.md` landing paragraph, update the `docs/pr-review.md` prerequisites and `sync-batch` text, and verify the added phrase and the existing documentation assertions pass in `test/pr-review-land.test.mjs`

## 2. Path-scoped archive commit

- [x] 2.1 Implement the `archive --apply` readiness check and auto-commit: derive the capability names from the archived change's `specs/*` and reject a name whose composed path escapes `openspec/specs`, accept only the source deletions, the archived directory, those named `openspec/specs` capability directories and another change's planning directory; refuse a staged index, an untracked path under the source change directory, a spec change outside the named capabilities and any other uncommitted path; require exactly one `<date>-<change>` archived directory and a safe change name; stage only the archived directory, the named capability directories and the source deletion; verify the staged set; commit `chore(openspec): archive <change>` with no body and record it; verify tests cover a parallel draft staying untracked and out of the commit, an unexpected path refused, a spec outside the named capabilities refused, an invalid capability name refused, a source leftover refused, a staged index refused before staging, an empty staged set refused, and a missing or ambiguous archive directory refused
- [x] 2.2 Implement the `archive --commit <sha> --apply` verification path: derive the capability directories from the archived directory, require the commit to be `HEAD`, its changed paths to stay inside the allowed set, and the index to be empty; verify tests cover a valid recorded commit, a commit changing another change's file refused, and recovery after an `archive-failed` attempt
- [x] 2.3 Update the `docs/pr-review.md` landing sequence steps, the command list entry and the `archive-pending` recovery outline for `archive --apply` and `archive --commit`, and verify the documentation test still finds `openspec_archive`, `archive`, `tree-mismatch` and the landing phase names

## 3. Integration verification

- [x] 3.1 Run `npm run test:affected -- scripts/pr-review-land.mjs lib/review/store.js` and verify both selected test files pass on Node 24
- [x] 3.2 Run `openspec_inspect` with `action: "validate"` and `strict: true` and verify no issues remain
- [x] 3.3 Run `npm run verify` on Node 24 and verify the test summary and the coverage verdict both pass

## Workflow follow-up

- Review the committed implementation before archive.
- Archive the change only when the user asks.
