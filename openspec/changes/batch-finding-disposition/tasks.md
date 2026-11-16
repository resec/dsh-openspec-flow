# Tasks

## 1. Disposition model

- [x] 1.1 Update the disposition unit tests in `test/review-unit.test.mjs`: remove the `issue` success path, assert that `deferred` without a note is rejected, assert that an `issue` argument alone no longer satisfies `deferred`, and add a readiness case whose record carries an old `issue` field. Then edit `lib/review/report.js` to drop the `issue` branch and the `finding.issue` write, and require a note for `deferred`. Verify: `node --test test/review-unit.test.mjs` exits 0.

## 2. Tool batch contract

- [x] 2.1 In `lib/tools/review.js`, add the `dispositions` parameter with closed entry objects (`id`, `status`, `note`, `waiver`, `approvedBy`) and the output `dispositions` entry, normalize the single `id` form to one entry, reject both forms together, reject top-level `status`/`note` with a batch, reject duplicate or unknown ids, reject `dispositions` with `scope: "plan-change"`, apply the batch atomically with one `saveReview`, let a finding `waive` use top-level `waiver`/`approvedBy` defaults, remove the `issue` parameter, and reject an explicit `issue` argument with a migration message. Verify: the new cases in `test/review-draft.test.mjs` pass for batch success, rollback, duplicate, unknown, both forms, top-level fields with a batch, plan-change exclusion, single form, batch waiver, the closed entry schema and the declared output field.
- [x] 2.2 Add apply-review batch cases to `test/review-apply.test.mjs` so a two-finding batch updates the apply record and the result lists both statuses. Verify: `node --test test/review-apply.test.mjs` exits 0.
- [x] 2.3 Update the `openspec_review` tool description to state that `dispositions` carries one or more findings in a single call, and keep the `dispositions` parameter description to one short sentence about the value only, per the shared-description rule. Verify: `node --test test/descriptions.test.mjs` exits 0 and the schema assertion in 2.1 sees an array of closed objects with `id` required plus the declared result field.

## 3. Documentation

- [x] 3.1 Update `docs/review.md`: keep a single-`id` example, add a batch example, state that an invalid entry leaves every finding unchanged, change the `deferred` requirement to a note, state that the old `issue` field is no longer accepted and old records keep it, and state that a plan-change `waive` takes `files` and not `dispositions`. Verify: `node --test test/review-doc.test.mjs` exits 0.
- [x] 3.2 Add one batch disposition sentence to the review section of `README.md` and keep its link to `docs/review.md`. Verify: `node --test test/review-doc.test.mjs` exits 0 and `grep -F dispositions README.md` prints the sentence.
- [x] 3.3 Extend `test/review-doc.test.mjs` with assertions for `dispositions`, the atomic rule, the note-only `deferred` rule, the old-record note, the single-`id` example and the plan-change distinction so the document cannot drift back. Verify: `node --test test/review-doc.test.mjs` exits 0.

## 4. Skills and version

- [x] 4.1 Update `skills/openspec-propose/SKILL.md` and `skills/openspec-apply-change/SKILL.md` to tell the agent to pass every remaining disposition in one `dispositions` call, keeping the single `id` form for one finding. Add content assertions for both skills to `test/skills.test.mjs` (`dispositions`, the single-call instruction, the single-`id` form), and add the plan-change `files` distinction for the apply skill only. Verify: `node --test test/skills.test.mjs` exits 0.
- [x] 4.2 Bump `package.json` to 0.5.0, update both root `version` fields in `package-lock.json`, the plugin version line in `docs/upgrading-openspec-cli.md`, and `metadata.generatedBy` in all five packaged skills to `dsh-openspec-flow@0.5.0`. Verify: `node --test test/skills.test.mjs` exits 0, `node -p "require('./package.json').version"` prints `0.5.0`, the lockfile root version is `0.5.0`, and `git status --short` shows no lockfile drift.

## 5. Integration verification

- [x] 5.1 Run `openspec_inspect` with `action: "validate"` and `strict: true` for `batch-finding-disposition`. Verify: `valid` is true and `issues` is empty.
- [x] 5.2 Run the full suite on Node 24: `PATH=/usr/local/n/versions/node/v24.22.2/bin:$PATH npm test`. Verify: exit code 0.
- [x] 5.3 Run the coverage gate on Node 24: `PATH=/usr/local/n/versions/node/v24.22.2/bin:$PATH npm run coverage:check`. Verify: exit code 0.
- [x] 5.4 Run `PATH=/usr/local/n/versions/node/v24.22.2/bin:$PATH npm run openspec:check`. Verify: exit code 0.

## Workflow follow-up

- Commit the implementation, then run the apply review until ready.
- Archive only when the user asks; then commit the archive, documentation and merged specs, and push to `origin/main`.
- Repack with `npm run bundle:pack -- --force` and reinstall the bundle only when the installed plugin must run the new logic.
