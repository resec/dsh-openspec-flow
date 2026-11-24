# Tasks

## 1. Correct the prerequisites

- [x] 1.1 Reword the main-worktree bullet in `docs/pr-review.md` so the watch keeps its `.cache/pr-review/worktrees/` checkout while landing runs in the main worktree, fast-forwards local `main` to `origin/main` and commits the archive there, matching `assertMainReady`, `git merge --ff-only` and the archive step in `scripts/pr-review-land.mjs`.
- [x] 1.2 Change the `gh label create owner-review` description in `docs/pr-review.md` to say the label is a queue signal and `mergeable` is the only landing authorization, matching the Owner-review signal and Landing sections.

## 2. Guard the wording

- [x] 2.1 Add a documentation test in `test/pr-review-land.test.mjs` that requires the landing fast-forward and the advisory label phrases and rejects the old main-worktree sentence and the old label description; confirm the test fails with the previous `docs/pr-review.md`.

## 3. Verify

- [x] 3.1 Run `node --test test/pr-review-land.test.mjs` on Node 24 (47 pass), then `/tmp/b3/gates.sh docs-pr-review-intro`: `openspec validate` strict valid, `openspec:check` 119 passed, requirement length gate ok, generated skills ok, `check:pr` ok, `npm run verify` 1432 pass with coverage plugin 98.63% line, 93.61% branch, 99.21% function.
