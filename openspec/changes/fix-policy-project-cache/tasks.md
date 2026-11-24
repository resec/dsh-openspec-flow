# Tasks

## 1. Stop caching a negative probe

- [x] 1.1 Keep only positive results in `PROJECT_CACHE`; re-probe a directory that is not an OpenSpec project on each assembly.
- [x] 1.2 Update the `PROJECT_CACHE` comment to match.

## 2. Guard the behaviour

- [x] 2.1 Assert that a directory judged not to be a project is detected as one once `openspec/` exists.
- [x] 2.2 Assert that the rule section turns empty-to-present in the same process.
- [x] 2.3 Assert that the rule is present after `openspec_init` on the session directory.
- [x] 2.4 Confirm the new assertions fail against the previous cache.

## 3. Verify

- [x] 3.1 Run `node --test test/policy.test.mjs`, `node --test --test-name-pattern='initializes an empty project' test/integration.test.mjs`, and `/tmp/b3/gates.sh fix-policy-project-cache` (strict validation, `npm run openspec:check`, the requirement-length gate, the generated-skills check, `check:pr`, `npm run verify`); repeat the two test commands with `lib/policy.js` stashed.
