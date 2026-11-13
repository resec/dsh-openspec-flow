# Tasks

## 1. Document

- [x] 1.1 Create `docs/review.md` with sections for purpose, objects, phases, reviewer modes, policy lock, reviewer model sources and the settings page, reports/findings, severity/verdict/readiness, records, failures, configuration and examples.
- [x] 1.2 Include the exact tool/action list, config keys/defaults and record path; verify the values against the code.
- [x] 1.3 Include two end-to-end examples: reviewers 0 and reviewers 1, each through draft and apply.

## 2. Repository workflow

- [x] 2.1 Update `README.md` with a review section and a link to `docs/review.md`; verify the link target exists.
- [x] 2.2 Update `AGENTS.md` to require draft review before apply and apply review before archive.
- [x] 2.3 Confirm the `development-workflow` delta carries the review gates and that archive merges it into the main spec; do not edit the main spec by hand.

## 3. Documentation guard

- [x] 3.1 Add `test/review-doc.test.mjs` that reads the document and checks tools, actions, config keys/defaults, record path and README link.
- [x] 3.2 Add a negative test for a removed tool or stale default; verify it fails with the offending name.

## 4. Verification

- [x] 4.1 Run `openspec validate --all --strict`, `npm test` and `npm run coverage:check` on Node 24; verify all pass.
- [x] 4.2 Run the documentation test and confirm it covers the examples' tool names, actions and config keys.
