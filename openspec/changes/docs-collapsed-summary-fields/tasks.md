# Tasks

## 1. Correct the requirement

- [x] 1.1 Restate the field set in "The client renders a collapsed card" to match `cardSummary` in `client.js`.
- [x] 1.2 Name `roundToken` and the numeric fallback in the collapsed-card scenarios.
- [x] 1.3 Confirm the change-name requirement and the extra-round-token requirement need no edit.

## 2. Verify

- [x] 2.1 Run `openspec validate docs-collapsed-summary-fields --strict`.
- [x] 2.2 Run `node --test test/review-doc.test.mjs` with the withdrawn field and confirm the failure.
- [x] 2.3 Run `/tmp/b3/gates.sh docs-collapsed-summary-fields`.
