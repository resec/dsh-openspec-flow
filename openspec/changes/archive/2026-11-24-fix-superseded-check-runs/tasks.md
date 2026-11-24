# Tasks

## 1. Green rollup helper

- [x] 1.1 Replace `checksGreen` with the newest-entry-per-check judgment and update its JSDoc; verify `node --test test/pr-review-watch.test.mjs` passes
- [x] 1.2 Add unit cases for a superseded failure, a newest failure or pending entry, a same-start-time tie, a queued entry with the zero timestamp, same-named checks in two workflows, a status context timestamped by `createdAt`, the absent-timestamp fallback and an empty rollup; verify `node --test test/pr-review-watch.test.mjs` passes

## 2. Shared gates

- [x] 2.1 Add a `filterCandidates` case where an older failure is followed by a successful run and verify the PR is returned as a candidate in `node --test test/pr-review-watch.test.mjs`
- [x] 2.2 Add a landing gate case where the same superseded rollup passes the plan and a newest failure is refused; verify `node --test test/pr-review-land.test.mjs` passes

## 3. Documentation

- [x] 3.1 Update the candidate, landing and requirement-length-section CI wording in `docs/pr-review.md` (lines 67, 91 and 97) so all three describe the newest-run judgment; verify the text matches the helper tests

## 4. Integration checks

- [x] 4.1 Run `npm run check:requirement-length`, `npm run openspec:check`, `npm run test:affected -- scripts/pr-review-watch.mjs scripts/pr-review-land.mjs` and `npm run verify` on Node 24; all must pass

## Workflow follow-up

- After the change lands and the watch is deployed, run `node scripts/pr-review-watch.mjs poll --json` and confirm a previously blocked green head appears as a candidate; the poll is read-only.
- Archive the change after the review requirements are satisfied; landing is requested separately by the maintainer.
