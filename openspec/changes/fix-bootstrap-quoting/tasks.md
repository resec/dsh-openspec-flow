# Tasks

## 1. Forward arguments whole

- [x] 1.1 Replace the `PASSTHROUGH` string in `scripts/bootstrap.sh` with positional words moved to the tail of `"$@"`, and exec `scripts/bootstrap.mjs` with `"$@"`.
- [x] 1.2 Confirm the `set -u` path still handles an absent `--node-mirror` value and an empty passthrough list.

## 2. Guard the forwarding

- [x] 2.1 Assert in `test/bootstrap.test.mjs` that an argument with a space reaches the entrypoint as one word, before and after `--`.
- [x] 2.2 Assert that `--playwright-host` keeps a value with a space in the same argument.
- [x] 2.3 Confirm both tests fail with the previous `scripts/bootstrap.sh`.

## 3. Verify

- [ ] 3.1 Run `node --test test/bootstrap.test.mjs`.
- [ ] 3.2 Run `openspec validate fix-bootstrap-quoting --strict`, `npm run openspec:check` and `npm run verify`, and record the test summary and the coverage verdict.
