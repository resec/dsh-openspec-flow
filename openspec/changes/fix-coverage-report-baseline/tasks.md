# Tasks

## 1. Fail on an unusable input

- [x] 1.1 Throw for a missing baseline unless `--update-baseline`.
- [x] 1.2 Throw for an unusable baseline unless `--update-baseline`.
- [x] 1.3 Keep coverage violations non-fatal in report mode.

## 2. Guard the behaviour

- [x] 2.1 Add a test covering a missing and an unusable baseline in report mode.

## 3. Verify

- [x] 3.1 Run `node --test test/coverage-gate.test.mjs test/coverage-stamp.test.mjs`.
- [x] 3.2 Run `npm test`, `openspec validate fix-coverage-report-baseline --strict` and `npm run openspec:check`.
- [x] 3.3 Run `npm run verify` on Node 24 and record its test summary and coverage verdict.

## 4. Apply review follow-up

- [x] 4.1 State the missing-baseline failure in "Report and enforce modes" and drop `skip_specs`.
- [x] 4.2 Cover the `--update-baseline` branch for a missing and an unusable baseline.
- [x] 4.3 Match the unusable-baseline message specifically, not any baseline message.
