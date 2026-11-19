# Tasks

## 1. Root ignore rule

- [x] 1.1 Add `openspec/.review/` to the repository root `.gitignore`, keep the tracked `openspec/.gitignore` unchanged, and assert both entries in `test/repo-layout.test.mjs`; verify with `node --test test/repo-layout.test.mjs`.
- [x] 1.2 Reference the existing `test/review-unit.test.mjs` case for a root rule whose worktree has no nested ignore file instead of duplicating it; verify that case still passes.

## 2. Exactly one active change

- [x] 2.1 Change `evaluateChange` to add a boundary error when more than one active change is touched, name every active change in stable order, keep the zero-change message, skip the task loop only for the multi-change case and keep restricted-path and dependency checks running; verify with `evaluateChange` cases in `test/check-pr-change.test.mjs`.
- [x] 2.2 Add `evaluateChange` cases for zero changes, one change with a checked task that passes, one change with an unchecked task that reports it, two changes named in order, and two changes plus a restricted path that still names the path; verify with `node --test test/check-pr-change.test.mjs`.
- [x] 2.3 Change the `CONTRIBUTING.md` active-change sentence to exactly one and add an assertion in `test/contributor-docs.test.mjs`; verify the assertion fails when the sentence says at least one.

## 3. Integration verification

- [x] 3.1 Run `openspec_inspect` with `action: "validate"` and `strict: true`; verify it reports no warnings.
- [x] 3.2 Commit the implementation on the sealed tree; verify `git status --porcelain` is empty.
- [x] 3.3 Run `npm run test:affected -- scripts/check-pr-change.mjs .gitignore` and `npm run verify` with Node 24 from `.cache/toolchain/node/bin` on the committed tree; verify the suite and coverage pass.
- [x] 3.4 Start the apply review and confirm it is ready before archive.

## Workflow follow-up

- Archive the change after the apply review is ready.
- Push after this change is archived and `npm run verify` passes.
