# Tasks

## 1. Documentation and tests

- [x] 1.1 Update `docs/pr-review.md`: Landing step 5 should skip `openspec_review action=resume` when the recorded apply review is passed and its `treeSha` equals the landing tree, and use the resume path otherwise; extend Landing step 9, the Schedule preamble, steps 7 and 8, and the closing rules, and correct the closing summary paragraph that says a review-only run polls again and that a completed prepare stops the run, so a review pass that the re-listing returns as a not-behind candidate continues in the same run with `plan`, `prepare`, `reviewed`, `merge`, `openspec_archive`, archive, push and `finish`, while an unlisted or behind pass stops before the lock. Add a continuation assertion to `test/local-pr-doc.test.mjs`. Verify with `node --test test/local-pr-doc.test.mjs test/pr-review-doc.test.mjs test/pr-review-land.test.mjs` and read the Schedule text against this task.
- [x] 1.2 Update the scheduled pull-request review loop paragraph in `AGENTS.md` to describe the same-run continuation and keep the phrase `recorded and merged in the same run`. Verify with `node --test test/contributor-docs.test.mjs`.
- [x] 1.3 In `test/local-pr-spec.test.mjs`, add a `landingSpec()` reader for `openspec/changes/same-run-review-landing/specs/pr-review-pipeline/spec.md` with the MAIN fallback, point the `Scheduled run sequencing` test at it while keeping the ten scenario names and keeping the `Contributor landing lock protocol` test on `pipelineSpec()`, and assert the delta adds `### Requirement: Same-run review landing` with `A review pass continues into landing`, `A behind pass waits for sync`, `An unlisted pass stops` and `A passed record skips the resume`. Verify with `node --test test/local-pr-spec.test.mjs`.

## 2. Scheduled prompt

- [x] 2.1 Update the five-minute scheduled-session prompt with `schedule_edit` so steps 7 and 8 match the documented continuation: after publishing a pass and `owner-review`, re-list candidates, continue only when that listing returns the reviewed pull request as a candidate with `behind: false`, no other landing is unfinished and the lock is free, target that pull request, run `plan`, `prepare`, `reviewed`, `merge`, `openspec_archive`, archive, push and `finish` under one lock, and stop before the lock for an unlisted or behind candidate. Verify with `schedule_view` that the prompt contains the continuation, the target and the stop.

## 3. Verification

- [x] 3.1 Run `npm run test:affected -- test/local-pr-spec.test.mjs test/local-pr-doc.test.mjs test/pr-review-doc.test.mjs test/pr-review-land.test.mjs test/contributor-docs.test.mjs` on Node 24 and confirm it passes.
- [x] 3.2 Run `npm run verify` on Node 24 and confirm the test summary and coverage verdict pass.
- [x] 3.3 Run `openspec_inspect` with `action: "validate"`, `strict: true` and confirm no findings.

## Workflow follow-up

- After the next real review pass, check `runs.jsonl` that the same run contains `candidates`, `plan`, `prepare`, `reviewed`, `merge`, `archive`, `push` and `finish`, and that the run also completed `openspec_archive` before the archive command; check a behind candidate stops before the lock, and check a run that stops after acquiring the lock releases it.
- Archive only when the user explicitly asks; archive updates the main spec from both the modified `Scheduled run sequencing` requirement and the added `Same-run review landing` requirement.
