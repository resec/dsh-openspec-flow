# Tasks

## 1. Configuration and preset

- [x] 1.1 Allow `reviewers: 1` in the draft and apply config and policy; verify 0 and 1 are accepted and other counts are refused.
- [x] 1.2 Add the `openspec-reviewer` preset and `./reviewer` package entry; verify the preset lists only read/search/reviewer tools and the changer catalog lacks `openspec_reviewer`.
- [x] 1.3 Register the reviewer subpath plugin and its `openspec_reviewer` tool; verify the tool is absent from the changer.

## 2. Shared report submission

- [x] 2.1 Extract report submission into `lib/review/submit.js`; verify self-review and reviewer submission share validation and finding updates.
- [x] 2.2 Add reviewer identity checks to `openspec_reviewer submit`; verify another agent id is refused.

## 3. External reviewer flow

- [x] 3.1 Start one activation for `reviewers: 1` in draft and apply review; verify the record stores child id, slot and activation state.
- [x] 3.2 Add `wait` with 250 ms polling and a segmented deadline; verify ready, waiting and overdue.
- [x] 3.3 Add `retry`, `replace` and `waive-reviewer`; verify replacement records the reason and waiver requires user approval.
- [x] 3.4 Update readiness for `reviewerWaived`; verify a waived reviewer can pass only with no open blocker.

## 4. Workflow text

- [x] 4.1 Update `lib/policy.js`, propose/apply/archive skills for `reviewers: 1`; verify the skill tests.
- [x] 4.2 Update README with the preset, reviewer tool and `wait`; verify the README mentions `openspec_reviewer`.

## 5. Integration and regression

- [x] 5.1 Add a fake-subagent integration test for start, wait, submit and ready apply.
- [x] 5.2 Add tests for overdue, retry, replace and waive-reviewer.
- [x] 5.3 Run `openspec_inspect` validate strict, `npm test` and `npm run coverage:check` on Node 24; verify all pass.
