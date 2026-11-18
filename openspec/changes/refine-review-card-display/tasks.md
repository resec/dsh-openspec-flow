# Tasks

## 1. Severity summary

- [x] 1.1 Add failing assertions to `test/review-client.test.mjs` for the `critical`/`major`/`minor`/`nit` counts, a summary without a next action, counts over open/fixed/waived findings, a card with no `findings` array, and the expanded round metadata still carrying the `下一步` row; verify `PATH="$HOME/.local/share/fnm/node-versions/v24.22.2/installation/bin:$PATH" node --test test/review-client.test.mjs` fails on the old summary.
- [x] 1.2 Implement `severityCounts` and rewrite `cardSummary` in `client.js`; verify the summary assertions and the existing card test pass.

## 2. Optional rows

- [x] 2.1 Add failing assertions to `test/review-client.test.mjs` for a finding without `rule`/`failure` and a disposition without `waiver`/`approvedBy`, and for the same rows rendered when the values exist; verify the test fails on the current rows.
- [x] 2.2 Implement the recorded-value row helper and filter `findingRows` plus the disposition rows in `client.js`; verify the hidden-row and shown-row assertions pass.

## 3. Readiness grouping

- [x] 3.1 Add failing assertions to `test/review-client.test.mjs` for three same-state open findings merging into one plural line, one finding keeping the singular sentence, blocking and non-blocking reasons staying apart, a two-id blocking group keeping the `blocking ` prefix, an unmatched reason staying unchanged, and group order following first occurrence; verify the test fails on the current one-line-per-reason output.
- [x] 3.2 Implement readiness grouping in `client.js` and render one row per group; verify every grouping assertion passes.

## 4. Documentation

- [x] 4.1 Update the card section of `docs/review.md`: the severity summary without a next action, the omitted unrecorded optional rows, and the merged readiness reasons; verify the three statements are present in the document.
- [x] 4.2 Extend `test/review-doc.test.mjs` with assertions for those three statements; verify the documentation test passes.

## 5. Integration checks

- [x] 5.1 Run both client and documentation tests on Node 24 with `PATH="$HOME/.local/share/fnm/node-versions/v24.22.2/installation/bin:$PATH" node --test test/review-client.test.mjs test/review-doc.test.mjs`; verify no failures.
- [x] 5.2 Run `npm run test:affected -- client.js` on Node 24; verify the selected suite passes.
- [x] 5.3 Run `npm run verify` on Node 24; verify the test summary and the coverage verdict pass.
- [x] 5.4 Run `openspec_inspect` with `action: "validate"` and `strict: true`; verify it reports no findings.
- [x] 5.5 Run `git status --porcelain` and `git diff --name-only`; verify only `client.js`, `test/review-client.test.mjs`, `test/review-doc.test.mjs`, `docs/review.md` and this change directory changed.

## Workflow follow-up

- Repack and reinstall the bundle only when the user wants the development GUI to show the new card, following `docs/installing-bundles.md`.
- Archive the change after the apply review is ready and the user requests it.
