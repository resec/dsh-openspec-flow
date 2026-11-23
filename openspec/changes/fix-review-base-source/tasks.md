# Tasks

## 1. Derive and persist the base source

- [x] 1.1 Compute `baseSource` from the branch that selected the base; a no-draft resume reuses the source recorded with the inherited base.
- [x] 1.2 Recompute the source recorded when a resume opens a round; the write already existed, only its value was wrong.

## 2. Guard the behaviour

- [x] 2.1 Add a test: explicit base, a disposed major finding, then a resume without `base`.
- [x] 2.2 Confirm the test fails against the previous source handling.

## 3. Verify

- [x] 3.1 Run `node --test test/review-apply.test.mjs` with a canonical `TMPDIR`.
- [x] 3.2 Run `openspec validate fix-review-base-source --strict`, `npm run openspec:check` and `npm run layout:check`.
