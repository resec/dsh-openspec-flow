# Tasks

## 1. Status projection

- [ ] 1.1 Add a helper mapping a policy review section to `{ mode, independent }` (`reviewers: 1` → `reviewer`/`true`, otherwise `self`/`false`) and let `projectReview` accept it as the no-record fallback; verify the existing status tests still pass.
- [ ] 1.2 Pass the derived pair only from the apply not-started branch whose section is enabled and available; keep `self`/`false` in the disabled and unavailable branches; verify new tests assert each branch.
- [ ] 1.3 Read `policy.json` in the draft status branch when no record exists and pass the derived pair only when the draft section is enabled; keep `self`/`false` for a disabled section or a missing policy; verify a new draft test asserts `reviewer`/`true` for `reviewers: 1` and a disabled-section test asserts `self`/`false`.
- [ ] 1.4 Keep a recorded review's values: assert an existing record with `reviewer`/`true` still reports those values when the policy is absent; verify by test.

## 2. Tests

- [ ] 2.1 Add an apply-status test for `reviewers: 1` before start and verify it also asserts `policy: true`, `enabled: true` and `available: true` stay unchanged.
- [ ] 2.2 Add a draft-status test for `reviewers: 1` before start and verify it asserts `reviewer`/`true`.
- [ ] 2.3 Add a test for `reviewers: 0` and verify both review kinds report `self`/`false`.
- [ ] 2.4 Add a disabled apply policy and a disabled draft policy, each with `reviewers: 1`, and verify both report `self`/`false`; for the disabled apply policy also verify `enabled: false` and no start next action, and for the disabled draft policy verify the existing start next action is unchanged.
- [ ] 2.5 Add a no-git project with `reviewers: 1` and verify status reports `self`/`false` with `available: false`.
- [ ] 2.6 Add a test for a change without `policy.json` and verify status reports `self`/`false` without failing.
- [ ] 2.7 Add a corrupt `policy.json` case for a draft review with no record and verify the draft and apply status calls fail with the same parse error, so the parity is deliberate.
- [ ] 2.8 Verify the recorded-review test keeps its mode when the policy would resolve differently.

## 3. Documentation

- [ ] 3.1 Add `mode` and `independent` to the status description in `docs/review.md`, covering both review kinds, the enabled-and-available derivation, the disabled or unavailable `self`/`false`, and the recorded-value rule; verify `test/review-doc.test.mjs` asserts both names after its phrase list follows the text.
- [ ] 3.2 Verify the `review-documentation` delta states the same field contract as the document, and that `openspec_inspect` with `action: "validate"` and `strict: true` passes.

## 4. Integration

- [ ] 4.1 Run `node --test test/review-apply.test.mjs test/review-draft.test.mjs test/review-doc.test.mjs` on Node 24 and verify every test passes.
- [ ] 4.2 Run `npm run verify` on Node 24 and verify the test summary and the coverage verdict both pass.
- [ ] 4.3 Run `openspec_inspect` with `action: "validate"` and `strict: true` and verify the change passes.

## Workflow follow-up

- Commit the implementation, then run the apply review before archive.
- Archive only on user request.
