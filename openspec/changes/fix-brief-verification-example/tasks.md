# Tasks

## 1. Render a legal example

- [x] 1.1 Offer `verified-fixed` only when the named finding is `fixed`; offer `still-open` and `regressed` for an `open` finding.
- [x] 1.2 Add the "verifications name only findings recorded before this round" sentence to the branch with no recorded findings.

## 2. Guard the text

- [x] 2.1 Parse the example in `test/review-reviewer.test.mjs` and assert `verified-fixed` is absent for an `open` finding and present for a `fixed` one.
- [x] 2.2 Run the report validator over both parsed examples and assert neither is refused.
- [x] 2.3 Confirm the new test fails against the previous `brief.js`.

## 3. Verify

- [x] 3.1 Run `node --test test/review-reviewer.test.mjs test/review-unit.test.mjs`.
- [x] 3.2 Run `npx openspec validate fix-brief-verification-example --strict`, `npm run openspec:check`, `node scripts/check-requirement-length.mjs`, `node scripts/check-pr-change.mjs` and `npm run verify`.
