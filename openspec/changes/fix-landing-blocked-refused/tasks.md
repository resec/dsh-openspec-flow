# Tasks

## 1. Refuse a stopped landing

- [x] 1.1 In `listLandingCandidates`, refuse every recorded phase that is not an open phase, keeping the existing `review-failed` and already-landing reasons.
- [x] 1.2 Name the rebase conflict and the recovery (rerun `prepare` after resolving, or remove the label) in the `blocked` refusal.

## 2. Document the recovery

- [x] 2.1 In `docs/pr-review.md`, state that a `blocked` landing is refused by `candidates` and how to recover.

## 3. Guard the discovery

- [x] 3.1 Assert that a conflicting `prepare` leaves `candidates` empty and one `refused` entry naming the pull request, the phase, the error and the recovery.
- [x] 3.2 Walk the phases named in `docs/pr-review.md` and assert each one is refused instead of listed.
- [x] 3.3 Confirm the new assertions fail with the previous candidate loop.

## 4. Verify

- [x] 4.1 Run `node --test test/pr-review-land.test.mjs`.
- [x] 4.2 Run `openspec validate fix-landing-blocked-refused --strict` and `npm run openspec:check`.
