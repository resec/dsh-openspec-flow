# Tasks

## 1. Project the state

- [x] 1.1 Add `redactText` and `redactState`.
- [x] 1.2 Keep the live web handle in the closure and store only `base` and `logPath`.
- [x] 1.3 Persist and print the state through `redactState`.

## 2. Redact the report

- [x] 2.1 Redact the provisioning error, the final `error` and the check details.

## 3. Verify

- [x] 3.1 Run `node --test test/lab-*.test.mjs`.
- [x] 3.2 Run `openspec validate fix-lab-redaction --strict`, `npm test` and `npm run openspec:check`.
