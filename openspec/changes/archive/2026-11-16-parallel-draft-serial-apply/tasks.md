# Tasks

## 1. Apply lock module

- [x] 1.1 Add `lib/review/apply-lock.js` with `applyLockPath`, `readApplyLock`, `acquireApplyLocks`, `releaseApplyLocks` and an exported `LOCK_FIELDS`, a `schemaVersion`, `change`, `store`, `changeRoot`, `implementationRoot` and `startedAt` record, and an `ensureReviewIgnored` call only on the non-git location; run `node --test test/review-lock.test.mjs` and verify acquire, same-change re-entry, stale takeover and release pass
- [x] 1.2 Resolve the implementation domain as the session's git worktree root, the nearest OpenSpec root, or the change's resolved root, and add the store domain for a store-backed change; place each lock in the domain's worktree git directory when it is a git repository, otherwise under `openspec/.review/`; verify a store change and a local change in one project share the implementation lock, two store changes from different stores serialize, the same store change from a second project is refused, `git status` stays empty, nested roots share one git-directory lock, and linked worktrees take separate locks
- [x] 1.3 Compare the implementation-domain identity as the review key `<store>#<change>` and the store-domain identity as the review key plus `implementationRoot`; treat a lock as stale when its `changeRoot` or `implementationRoot` no longer exists. Verify a same-named change in another store is refused, a second project applying one store change is refused while the same project re-enters, and a vanished implementation project makes its store lock replaceable
- [x] 1.4 Acquire the implementation lock before the store lock, release every lock acquired by the same call on failure, and guard every read-modify-write with `withReviewLock` plus a temporary file and rename; verify a partially acquired set is released and two concurrent acquires leave exactly one holder

## 2. Apply entry enforcement

- [x] 2.1 Acquire the locks in `assertDraftReviewReady` after readiness and before `sealDraft`, and release locks created by the same call when the seal fails; verify a refused lock leaves the draft record without an apply base and a failed seal leaves no lock
- [x] 2.2 Acquire the locks in `openspec_apply_next` when the draft review is disabled or the change has no policy; verify two changes cannot both pass, including a non-git project and a store change plus a local change
- [x] 2.3 Acquire the locks in apply review `start` and `resume`; verify a legacy change without a lock can acquire it and a second change is refused with the holder named
- [x] 2.4 Make every lock refusal name the holding review key and the absolute lock file paths, and tell the agent to ask the user before any removal; verify the refusal wording test

## 3. Archive integration

- [x] 3.1 Check the locks in `openspec_archive` before validation: refuse only when one names another identity, proceed when none does (including when only one lock is present), release every lock that names its change after a successful archive, keep them on failure; verify each case in `test/review-serial.test.mjs`

## 4. Seal and dirty-tree rules

- [x] 4.1 Build the seal change prefix and the root `.gitignore` allowance from worktree-relative paths while keeping the artifact-hash check; verify a nested-root seal with `packages/x/openspec/changes/<change>/` and `packages/x/openspec/.gitignore` passes and a commit that also changes code is refused
- [x] 4.2 Filter uncommitted paths under any other `openspec/changes/` directory from the seal, apply review and archive clean-tree checks using worktree-relative paths, and update the apply review requirement, its dirty-tree scenario and the flow rule to match; verify a nested root's draft edits pass those checks, a path under the reviewed change still refuses, and a path outside `openspec/changes/` still refuses

## 5. Concurrent draft coverage

- [x] 5.1 Add regression tests for two changes starting, resuming and reporting draft reviews side by side, including two independent reviewers; verify each record, reviewer slot and wait deadline stays per change
- [x] 5.2 Add two-change integration coverage for a parallel draft's uncommitted artifacts during the holder's seal, apply review and archive; the lock module covers a store change running beside a local change. Verify the holder proceeds, the other change stays in review, and only one apply proceeds

## 6. Documentation and skills

- [x] 6.1 Update `README.md`, `docs/review.md`, `AGENTS.md`, `lib/policy.js` and the shipped skills with the concurrent draft, serial apply, dirty-tree exception, lock domains, review-key identity, user-only release and staging contract; run `node --test test/review-doc.test.mjs test/skills.test.mjs test/policy.test.mjs test/descriptions.test.mjs` and verify they pass
- [x] 6.2 Extend `test/review-doc.test.mjs` `checkDocument` with every lock location and `LOCK_FIELDS` imported from the lock module; verify removing the lock section from `docs/review.md` fails the test
- [x] 6.3 Document the paused-change release (the user deletes the lock files named in the refusal; the agent must ask) and the staging rule (the reviewed change directory plus the plugin-written `openspec/.gitignore` when present) in `docs/review.md`; verify the documentation test covers both sentences
- [x] 6.4 Document both lock domains and their file locations (worktree git directory or `openspec/.review/`, plus the store domain), the `implementationRoot` field, and the resolved-root fallback; verify the documentation test finds each location

## 7. Integration verification

- [x] 7.1 Run `openspec_inspect` with `action: "validate"` and `strict: true` and verify zero findings
- [x] 7.2 Run `npm test` on Node 24 and verify every test file passes
- [x] 7.3 Run `npm run coverage:check` and verify the baseline still passes

## Workflow follow-up

- Repack the bundle and reinstall it, then run the apply review with the new plugin logic.
- Archive the change only after the apply review is ready and the user asks.
