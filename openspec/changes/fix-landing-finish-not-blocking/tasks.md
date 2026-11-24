# Tasks

## 1. Stop counting a pushed landing as open

- [x] 1.1 Remove `pushed` from `OPEN_PHASES` in `scripts/pr-review-land.mjs` and record why it stays out.
- [x] 1.2 Keep `finish` accepting `pushed` and keep `prepare` refusing a phase past the merge for the same pull request.

## 2. Name the retry phase in the documentation

- [x] 2.1 Add the `pushed` resume step to the scheduled run and the cleanup retry to the landing steps and phase paragraph of `docs/pr-review.md`.

## 3. Cover the failure path

- [x] 3.1 Make `forgetPullRequest` fail once, then assert the phase stays `pushed`, `candidates` and `prepare` for another pull request still work, and a second `finish` succeeds with `origin/main` unchanged.
- [x] 3.2 Confirm the new assertions fail against the previous `OPEN_PHASES` set.

## 4. Verify

- [x] 4.1 Run `node --test test/pr-review-land.test.mjs`.
- [x] 4.2 Run `/tmp/b3/gates.sh fix-landing-finish-not-blocking` on Node 24 after the implementation commit, and record the test summary and the coverage verdict.
