# Tasks

## 1. Correct the wording

- [x] 1.1 Reword the `COVERAGE_SKIP=1` sentence in `docs/lab.md`, `AGENTS.md` and `README.md` to say it skips the whole `npm run verify` run.
- [x] 1.2 Reword the same claim in the `scripts/install-hooks.mjs` install message.

## 2. Guard the wording

- [x] 2.1 Assert the corrected sentence and the absence of "skips only coverage" in `test/lab-doc.test.mjs`.
- [x] 2.2 Confirm the assertion fails against the old wording.

## 3. Verify

- [x] 3.1 Run `node --test test/lab-doc.test.mjs test/hooks.test.mjs`.
- [x] 3.2 Run `openspec validate docs-coverage-skip-wording --strict` and `npm run openspec:check`.
