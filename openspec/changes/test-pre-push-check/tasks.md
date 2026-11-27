# Tasks

## 1. Replace the stale prose guard

- [x] 1.1 Rewrite `test/pre-push-spec.test.mjs` to spawn `scripts/check-pre-push.mjs` in a temporary project, drop the archived `draft-review-length-gate` constant and `splitSpec()`, and assert the gate's decision instead of spec text; verify `node --test test/pre-push-spec.test.mjs` passes.
- [x] 1.2 Read `test/check-pre-push.test.mjs` and add only its missing case: an in-progress change whose delta fails the full `openspec validate --all --strict` does not block the main-only gate. Assert the full check fails first so the fixture cannot pass vacuously.
- [x] 1.3 Confirm the new test fails when the gate stops scoping: temporarily change the first validation to `validate --all --strict`, run the test, restore the script, and note the result.

## 2. Verification

- [x] 2.1 Run `npm test` and `/tmp/b3/gates.sh test-pre-push-check` on Node 24 and record the test, coverage and gate results.
