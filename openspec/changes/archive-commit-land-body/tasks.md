# Tasks

## 1. Archive commit message

- [x] 1.1 Change `commitArchive` in `lib/worktree/land.js` to commit with the subject `chore(openspec): archive <change>` and a second `-m` body `Landed from <landCommit>`; verify the fresh-land test asserts both the subject and the body.
- [x] 1.2 Add subject and body assertions to the legacy-merge resume test and the archive-commit-failure retry test in `test/worktree-land.test.mjs`; verify both retry paths read `Landed from <landCommit>` from `--format=%b`.
- [x] 1.3 Run `npm run test:affected -- lib/worktree/land.js test/worktree-land.test.mjs` and verify the land tests pass.
- [x] 1.4 Verify `openspec_inspect` `action: "validate"` with `strict: true` passes for this change.

## 2. Full gate

- [ ] 2.1 Run `npm run verify` on Node 24 and verify the test summary and coverage verdict pass.

## Workflow follow-up

- Start the draft review and finish it before apply.
- Apply in the plugin worktree, commit the implementation, run the apply review and finish it.
- Land with `approvedBy: "user"` so the archive commit is created with the new message, then verify the landed commit subject and body.
