# Tasks

## 1. Review store and policy

- [x] 1.1 Add `lib/review/store.js` for the review root `openspec/.review/<store>#<change>/`, atomic JSON reads/writes, directory locking and `git check-ignore` checks; verify with unit tests for path selection, store keys, lock refusal and atomic write failure.
- [x] 1.2 Add `lib/review/config.js` to normalize the draft review settings (`enabled`, `reviewers: 0`, `maxRounds`, `waitMinutes`) and to write/read `policy.json`; verify defaults, invalid values and policy immutability with unit tests.
- [x] 1.3 Ensure `openspec/.gitignore` contains `.review/` when a policy or review directory is created; verify with a test that a record path is ignored and that an unwritable ignore file fails closed.

## 2. Draft object and brief

- [x] 2.1 Add `lib/review/object.js` to collect `proposal.md`, `specs/**/*.md`, `design.md`, `tasks.md`, `.openspec.yaml` and the intent, and compute the sorted `changeHash`; verify stable output, ordering and content-change detection.
- [x] 2.2 Add `lib/review/brief.js` to write the draft brief with artifact paths, hashes, review axes and report instructions; verify the brief names every required artifact and contains no CLI token.
- [x] 2.3 Run the bundled validator before a draft start and reject invalid artifacts; verify with a fixture change that fails validation.

## 3. Report, findings and readiness

- [x] 3.1 Add `lib/review/report.js` to validate the report shape, finding ids/severities/axes, critical/major evidence fields, verdict consistency and summary limits; verify each rejection path with unit tests.
- [x] 3.2 Add finding disposition and verification transitions to the review record; verify that critical/major findings cannot be deferred or rejected and that `fixed` requires a note.
- [x] 3.3 Add the `ready` calculation over the latest report, dispositions, verdict and current `changeHash`; verify pass, open blocker, stale hash and all-disposed cases.

## 4. Review tool and configuration

- [x] 4.1 Add `lib/tools/review.js` registering `openspec_review` with `start`, `status`, `self-report`, `report`, `dispose`, `waive`, `extend` and `abandon`; verify the schema rejects unknown actions and the output validates for every action.
- [x] 4.2 Add the `reviews.draft` field to `index.js` config validation and register `openspec_review` only when the draft review is enabled; verify the tool is absent when disabled and present when enabled.
- [x] 4.3 Update tool descriptions and output schemas so no description names the OpenSpec CLI; verify `test/descriptions.test.mjs` passes.

## 5. Change creation and apply gate

- [x] 5.1 Write the policy before `openspec new change` in `openspec_new_change` and remove it when creation fails; verify that a policy write failure creates no change directory.
- [x] 5.2 Add the draft review gate to `openspec_apply_next`, record `applyBaseCommit` in a git project and skip the gate for a change without a policy; verify with a ready review, a blocked review and a legacy change.
- [x] 5.3 Verify the gate leaves apply state unchanged when it refuses.

## 6. Workflow text

- [x] 6.1 Add the draft review gate to `lib/policy.js` and verify `test/policy.test.mjs` checks the new sentence.
- [x] 6.2 Update `skills/openspec-propose/SKILL.md` to start the review, read the brief, submit `self-report` for `reviewers: 0` and stop on blockers; verify with the skill tests.
- [x] 6.3 Update `README.md` with the tool, configuration and review record path; verify the README mentions `openspec_review` and the policy lock.

## 7. Integration and regression

- [x] 7.1 Add an integration test that creates a fixture change, locks the policy, starts a draft review, submits a self-review, passes apply and records the base commit; verify with the real bundled CLI.
- [x] 7.2 Add a regression test that `openspec validate --all --strict` still ignores `openspec/.review/`.
- [x] 7.3 Run `openspec_inspect` with `action: "validate"` and `strict: true`, `npm test` and `npm run coverage:check` on Node 24; verify all pass.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Update the archive commit, merged specs and documentation in one commit.
