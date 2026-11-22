# Tasks

## 1. Render the axis

- [x] 1.1 Add a `类别` row for `finding.axis` to the expanded card's finding rows.

## 2. Guard the rendering

- [x] 2.1 Assert the row order and the axis value in `test/review-client.test.mjs`.
- [x] 2.2 Confirm the assertion fails against the previous row list.

## 3. Verify

- [x] 3.1 Run `node --test test/review-client.test.mjs`.
- [x] 3.2 Run `openspec validate fix-card-axis-row --strict`, `npm run openspec:check` and `npm run layout:check`.
