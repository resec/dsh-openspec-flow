# Tasks

## 1. Omit the body

- [x] 1.1 Add `report` only when it is present.
- [x] 1.2 Assert the key is absent for a missing report.

## 2. Verify

- [x] 2.1 Run `node --test test/review-cards.test.mjs test/review-cards-endpoint.test.mjs`.
- [x] 2.2 Run `openspec validate fix-card-report-absence --strict` and `npm run openspec:check`.
