# Tasks

## 1. Policy and configuration

- [x] 1.1 Add `reviews.apply` (`enabled: true`, `reviewers: 0`, `maxRounds: 5`, `waitMinutes: 15`) to config normalization and the locked policy; verify defaults, bounds and the disabled case with unit tests.
- [x] 1.2 Extend the policy reader with apply defaults and a disabled state; verify a policy without the apply section is treated as disabled and is not rewritten.

## 2. Apply object and preconditions

- [x] 2.1 Add git helpers for `HEAD`, `HEAD^{tree}`, `merge-base` and a clean-working-tree check; verify with a temporary git repository and a dirty-tree refusal.
- [x] 2.2 Add the apply start path: require git, a clean tree and a commit; record `commitSha`, `treeSha` and `baseTreeSha`; verify the recorded values with `git rev-parse`.
- [x] 2.3 Bind apply start to the draft artifact hash; verify that a changed change artifact refuses the start and an unchanged one succeeds.
- [x] 2.4 Use the recorded `applyBaseCommit` when present, fall back to `merge-base`, and accept an explicit `base`; verify each path with a temporary git repository.

## 3. Review actions and report

- [x] 3.1 Extend `openspec_review` with `review: "apply"` for start, status, self-report, report, dispose, waive, extend and abandon; verify the schema and each action's refusal paths.
- [x] 3.2 Store apply rounds and findings in the same record with `objectKind: "tree"`; verify a passing report, a blocker, a later-round verification and a user waiver.
- [x] 3.3 Recompute the tree hash in status, report and readiness; verify that moving `HEAD` invalidates the review.

## 4. Archive gate

- [x] 4.1 Add `assertApplyReviewReady` to `openspec_archive` before any change read or validation; verify a blocked review moves no file and a ready review proceeds.
- [x] 4.2 Skip the gate when apply review is disabled or the project has no git; verify both cases.
- [x] 4.3 Verify the gate leaves the change directory and validation untouched on refusal.

## 5. Workflow text

- [x] 5.1 Add the apply review gate to `lib/policy.js` and verify `test/policy.test.mjs` checks the new sentence.
- [x] 5.2 Update `skills/openspec-apply-change/SKILL.md` to commit, start the apply review, submit the self-report for `reviewers: 0` and stop on blockers; verify with the skill tests.
- [x] 5.3 Update `skills/openspec-archive-change/SKILL.md` to check the apply review before archive and state the non-git boundary; verify with the skill tests.
- [x] 5.4 Update `README.md` with the apply review actions, configuration and archive gate; verify the README mentions `review: "apply"`.

## 6. Integration and regression

- [x] 6.1 Add an integration test that applies, commits, starts an apply review, submits a self-review and archives; verify with the real bundled CLI and a temporary git repository.
- [x] 6.2 Add a regression test that archive is refused while an apply blocker is open and that no file moves.
- [x] 6.3 Run `openspec_inspect` with `action: "validate"` and `strict: true`, `npm test` and `npm run coverage:check` on Node 24; verify all pass.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Update the archive commit, merged specs and documentation in one commit.
