# Tasks

## 1. Stop caching a negative probe

- [ ] 1.1 Keep only positive results in `PROJECT_CACHE`; re-probe a directory that is not an OpenSpec project on each assembly.
- [ ] 1.2 Update the `PROJECT_CACHE` comment to match.

## 2. Guard the behaviour

- [ ] 2.1 Assert that a directory judged not to be a project is detected as one once `openspec/` exists.
- [ ] 2.2 Assert that the rule section turns empty-to-present in the same process.
- [ ] 2.3 Assert that the rule is present after `openspec_init` on the session directory.
- [ ] 2.4 Confirm the new assertions fail against the previous cache.

## 3. Verify

- [ ] 3.1 Run the targeted tests and the full gate.
