# Tasks

## 1. State the counting unit

- [x] 1.1 Add the counting unit to the requirement description growth requirement and keep its header and every scenario.
- [x] 1.2 State the unit and the emoji consequence in `docs/review.md`.

## 2. Pin the unit

- [x] 2.1 Add a boundary test with an astral character to `test/review-length.test.mjs`.
- [x] 2.2 Guard the new document sentence in `test/review-doc.test.mjs`.

## 3. Verify

- [x] 3.1 Run `node --test test/review-length.test.mjs test/review-doc.test.mjs`.
- [x] 3.2 Run `npm run verify` on Node 24 on the committed tree and record its test summary and coverage verdict, and `openspec_inspect` with `action: "validate"` and `strict: true`.
