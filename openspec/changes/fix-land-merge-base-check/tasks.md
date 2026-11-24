# Tasks

## 1. Compare the base GitHub reports

- [x] 1.1 Return `baseRefOid` from the landing gates and compare it with the recorded pre-merge main in `mergeLanding`.
- [x] 1.2 Name the recovery action in the refusal and leave `gh pr merge` uncalled.
- [x] 1.3 Rework "merge refuses when origin/main moved after prepare" to move the remote without updating the local tracking ref.

## 2. Pin the reviewed head

- [x] 2.1 Pass `--match-head-commit <head>` to `gh pr merge --rebase`.
- [x] 2.2 Record merge arguments in the fake `gh` and assert the flags with the reviewed head.

## 3. Document

- [x] 3.1 Describe the base comparison and the head pin in `docs/pr-review.md` and guard both phrases.

## 4. Verify

- [x] 4.1 Run `node --test test/pr-review-land.test.mjs` (28 tests, 28 pass).
- [x] 4.2 Run `/tmp/b3/gates.sh fix-land-merge-base-check` (strict validation, `openspec:check`, requirement length, generated skills, `check:pr`, `npm run verify`).
