# Tasks

## 1. Forward arguments whole

- [x] 1.1 Replace the `PASSTHROUGH` string in `scripts/bootstrap.sh` with positional words moved to the tail of `"$@"`, and exec `scripts/bootstrap.mjs` with `"$@"`.
- [x] 1.2 Confirm the `set -u` path still handles an absent `--node-mirror` value and an empty passthrough list.

## 2. Guard the forwarding

- [x] 2.1 Assert in `test/bootstrap.test.mjs` that an argument with a space reaches the entrypoint as one word, before and after `--`.
- [x] 2.2 Assert that `--playwright-host` keeps a value with a space in the same argument.
- [x] 2.3 Confirm both tests fail with the previous `scripts/bootstrap.sh`.

## 3. Verify

- [x] 3.1 Run `node --test test/bootstrap.test.mjs`: 32 tests, 32 pass, 0 fail.
- [x] 3.2 Run `openspec validate fix-bootstrap-quoting --strict` (valid), `npm run openspec:check` (121 passed, 0 failed), `node scripts/check-requirement-length.mjs` (ok), `node scripts/check-generated-skills.mjs` (ok) and `npm run verify` on Node v24.22.2 (1466 tests, 1466 pass, 0 fail; coverage plugin line 98.64%, branch 93.70%, function 99.21%, no violations).
