# Tasks

## 0. Pre-apply entry-model text merge

- [x] 0.1 After `review-entry-model` archives and before apply starts, merge its entry facts into these six shared requirements: `Apply review uses the draft base and report lifecycle`, `openspec_init writes the default review configuration`, `The document matches configuration defaults`, `The README states the project review file`, `The read-only configuration page registers and reports` and `The review document states the shared brief report contract`. Keep each archived description unchanged; only delete `all dispositions` from the apply-report description, and put pass-criteria facts in new scenarios or the ADDED `Apply readiness follows the pass criteria`; if an archived description would exceed 500, move the fact to a scenario or ADDED requirement and do not merge into the description. Add read-back assertions for every retained entry fact: `test/review-file.test.mjs` asserts the `openspec_init` default document carries the entry keys and `pipeline.beforeApply`/`beforeArchive`; `test/review-settings.test.mjs` asserts the page shows entries and `pipeline.beforeApply`/`beforeArchive`; `test/review-doc.test.mjs` asserts the pipeline sentence, the README entry facts, the defaults table's entry keys and pipeline, and the brief contract's entry naming; `test/review-apply.test.mjs` asserts the apply entry and its `pipeline.beforeApply` default draft baseline. The three pass fields are asserted by groups 1 and 5 when they are implemented, not here. Run `node --test test/review-file.test.mjs test/review-settings.test.mjs test/review-doc.test.mjs test/review-apply.test.mjs`, `openspec_inspect action="validate" change="review-pass-criteria" strict=true` and `node scripts/check-requirement-length.mjs --change review-pass-criteria`; then `openspec_review action=resume review=draft` and wait until ready. Apply starts at 1.1.

## 1. Profile parameters and defaults

- [x] 1.1 Add optional `passCriteria`, `allowDeferred` and `allowRejected` to the profile normalizer, with enum and boolean validation and the `major`/`true`/`true` defaults; verify `npm run test:affected -- lib/review/config.js test/review-file.test.mjs` covers accepted, omitted and rejected values.
- [x] 1.2 Add the three resolved fields to `reviewSection` and to `DEFAULT_DRAFT_REVIEW` / `DEFAULT_APPLY_REVIEW`; verify `node --test test/review-file.test.mjs` asserts the resolved section always carries them.
- [x] 1.3 Make `defaultReviewConfigText()` write the three fields explicitly in both default profiles; verify `node --test test/review-file.test.mjs` asserts the generated file text carries all three values per profile.

## 2. Policy lock and round criteria

- [x] 2.1 Lock `passCriteria`, `allowDeferred` and `allowRejected` in every policy review section, applying defaults for an omitted profile field; verify `npm run test:affected -- lib/review/policy.js test/review-draft.test.mjs` reads the locked values from a new policy.
- [x] 2.2 Store the resolved criteria on the review record when a round opens, and read `major`/`true`/`true` for a record without them; verify `node --test test/review-draft.test.mjs test/review-apply.test.mjs` covers new and legacy records.
- [x] 2.3 Read a legacy policy without the three fields as `major`/`true`/`true` without rewriting the file; verify `node --test test/review-unit.test.mjs test/review-draft.test.mjs` asserts the bytes are unchanged.
- [x] 2.4 Raise `POLICY_SCHEMA_VERSION` one level above the version archived by `review-entry-model` (expected `4`) and update the policy tests; verify `node --test test/review-draft.test.mjs test/review-apply.test.mjs` asserts the written version and that old policies remain readable.

## 3. Finding lifecycle and dispositions

- [x] 3.1 Extend the finding statuses with `verified-deferred` and `verified-rejected`, update `closed()` and the status summary, and count both new terminal statuses in `summarizeFindings`; verify `npm run test:affected -- lib/review/report.js test/review-unit.test.mjs` covers every terminal status.
- [x] 3.2 Refuse `deferred` and `rejected` dispositions for in-threshold findings and for a closed profile switch, while keeping `fixed` and user `waived`; verify `node --test test/review-unit.test.mjs test/review-draft.test.mjs` covers each refusal and the unchanged record.
- [x] 3.3 Accept `verified-deferred` and `verified-rejected` only for their matching recorded disposition, accept `still-open` as a return to `open`, and keep `verified-fixed` and `regressed` behavior; verify `node --test test/review-unit.test.mjs test/review-apply.test.mjs` covers the transition table.
- [x] 3.4 Keep the disposition batch atomic when one entry is refused; verify `node --test test/review-unit.test.mjs` asserts no finding changes on a mixed batch.

## 4. Readiness, report verdict and brief

- [x] 4.1 Make draft and apply readiness depend only on in-threshold findings, leaving below-threshold findings non-blocking while keeping the hash, length, execution and blocked-draft behavior; verify `npm run test:affected -- lib/review/readiness.js test/review-draft.test.mjs test/review-apply.test.mjs` covers both thresholds.
- [x] 4.2 Tighten report validation so `pass` requires every in-threshold finding resolved and `changes-requested` requires an unresolved in-threshold finding, and pass the resolved criteria through `submitReport` into `assertReport`; verify `node --test test/review-unit.test.mjs test/review-draft.test.mjs test/review-apply.test.mjs` covers accepted and refused verdicts and the criteria handoff.
- [x] 4.3 Add the verification candidates (`fixed`, `deferred`, `rejected`), their confirmation statuses and the pass-criteria verdict rule to the shared brief report contract; verify `npm run test:affected -- lib/review/brief.js test/review-reviewer.test.mjs` asserts the candidate list and the verdict rule in both briefs.

## 5. Status, card and page surfaces

- [x] 5.1 Add `verifiedDeferred` and `verifiedRejected` to the `findings` result schema and make `blocking` count unresolved in-threshold findings; verify `node --test test/review-status-mode.test.mjs test/review-unit.test.mjs` validates the result against the registered schema.
- [x] 5.2 Return the new terminal statuses and their verification round from the reviewer `findings` read; verify `node --test test/review-reviewer.test.mjs` covers both statuses.
- [x] 5.3 Carry the new counts in the review-card payload and keep the client's per-severity summary and expanded status rows correct; verify `node --test test/review-cards.test.mjs test/review-client.test.mjs` covers a card with both terminal statuses.
- [x] 5.4 Show `passCriteria`, `allowDeferred` and `allowRejected` on the read-only profile row; verify `node --test test/review-settings.test.mjs` asserts the three values render.

## 6. Documentation and repository configuration

- [x] 6.1 Update `docs/review.md` with the threshold, disposition table, finding statuses, readiness, report verdict, brief contract, status counts and configuration defaults; extend `test/review-doc.test.mjs` to assert the threshold, disposition table, `verified-deferred`/`verified-rejected` statuses, `verifiedDeferred`/`verifiedRejected` counts, and the readiness and verdict rules; verify `node --test test/review-doc.test.mjs` passes.
- [x] 6.2 Update the README review configuration section with the optional fields and their defaults and the changed readiness and verdict behavior; extend `test/review-doc.test.mjs` to assert the three optional fields with their defaults and the new readiness/verdict statements; verify `node --test test/review-doc.test.mjs` passes.
- [x] 6.3 Update `openspec/reviews.json` so `standard-directory` and `standard-tree` carry explicit `major`/`true`/`true`, and `pr-tree` (from `review-entry-model`) carries `nit`/`false`/`false`; add a test that reads the repository file and asserts the fields, and verify with `node --test test/review-file.test.mjs`.

## 7. Integration verification

- [x] 7.1 Confirm no pull-request script changed by diffing the recorded apply base (or seal commit) against `HEAD` and checking untracked or staged paths: `git diff --name-only <base>..HEAD -- 'scripts/pr-*'` and `git status --porcelain -- 'scripts/pr-*'` are both empty.
- [x] 7.2 Run the full instrumented suite on Node 24 with `npm run verify` and record the test and coverage verdicts.
- [x] 7.3 Run `openspec_inspect` with `action: "validate"`, `change: "review-pass-criteria"` and `strict: true`, and record the result.

## Workflow follow-up

- After `review-entry-model` archives, perform task 0.1 before apply, then mark it done with `openspec_mark_task_done`; next run `openspec_review action=resume review=draft` and wait until the draft review is ready. Apply starts at 1.1.
- Run the apply review on the committed tree before archive.
- Archive only after this review is ready and `review-entry-model` has archived at the expected policy schema version.
