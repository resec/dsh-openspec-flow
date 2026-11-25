# Tasks

## 1. Render the axis

- [x] 1.1 Add a `类别` row for `finding.axis` to the expanded card's finding rows.

## 2. Guard the rendering

- [x] 2.1 Assert the row order and the axis value in `test/review-client.test.mjs`.
- [x] 2.2 Confirm the assertion fails against the previous row list.

## 3. Document the card

- [x] 3.1 Name `类别` in the card shape of `docs/review.md`, including the rows omitted when unrecorded, and guard the row order in `test/review-doc.test.mjs`.

## 4. Verify

- [x] 4.1 Run `node --test test/review-client.test.mjs`.
- [x] 4.2 Run `npm run test:affected -- client.js` and `npm run verify` on Node 24 after the implementation commit, and record the test summary and the coverage verdict.
- [x] 4.3 Run `openspec validate fix-card-axis-row --strict`, `npm run openspec:check` and `npm run layout:check`.
