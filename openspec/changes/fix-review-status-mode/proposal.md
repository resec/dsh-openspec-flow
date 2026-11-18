# Proposal: fix-review-status-mode

## Why

`openspec_review` with `action: "status"` reports `mode` and `independent` from the review record, and falls back to the fixed pair `self`/`false` when no record exists. The locked policy already decides the mode the first `start` will use, so before a start the status contradicts the policy: change `speed-up-test-execution` returned `mode: "self"`, `independent: false` for an apply status while its policy had `reviewers: 1`, and the same change started as `mode: "reviewer"`, `independent: true`.

A caller that plans the submission from the status field can therefore prepare a `self-report` for a review that starts with an independent reviewer. That call is refused (`independent reviewers use openspec_reviewer, not self-report`) and costs a round trip.

The `tool-surface` status requirement specifies `policy`, `enabled` and `available` but not where `mode` and `independent` come from, so the projection has no contract to follow. The `review-documentation` requirement enumerates the status fields the review document must explain, and it names only those three.

## What Changes

- When a review has no record and its locked section is enabled and available, derive `mode` and `independent` from that section: `reviewers: 1` reports `reviewer` and `true`; `reviewers: 0` reports `self` and `false`.
- A disabled section or a project without git keeps the `self`/`false` pair, because no start can occur there and reporting an independent reviewer would mislead the same caller.
- A recorded review keeps reporting its recorded mode and independence.
- Apply the same rule to draft status, which uses the same projection.
- Document `mode` and `independent` wherever `docs/review.md` describes status fields, for both review kinds, with the derivation and the recorded-value rule.
- Add regression tests for the apply and draft paths, both reviewer counts, the disabled and unavailable branches, the missing-policy case, the recorded case and the corrupt-policy failure parity with apply status.

## Capabilities

### Modified Capabilities

- `tool-surface`: review status contracts `mode` and `independent` for an enabled and available review without a record from the locked policy, keeps `self`/`false` for a disabled or unavailable review, and keeps the recorded values once a review exists.
- `review-documentation`: the review document explains the two fields with their derivation and the recorded-value rule, alongside `policy`, `enabled` and `available`.

## Impact

- Code: `lib/tools/review.js` (`projectReview` and the `reviewStatus` branches).
- Tests: `test/review-apply.test.mjs`, `test/review-draft.test.mjs`, `test/review-doc.test.mjs`.
- Docs: `docs/review.md`.
- No review record schema, tool parameter, card payload, dependency or `dist/` change.

## Out of Scope

A change with no policy file, or a legacy policy without the apply section, keeps reporting `self`/`false` because no section is locked. Its first start builds or migrates the section from plugin settings, which status cannot see; that residual divergence is recorded in the design instead of being guessed from settings.
