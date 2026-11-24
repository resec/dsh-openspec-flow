# Tasks

## 1. Move the verdict into one implementation

- [x] 1.1 Add `qualifiesHostVersion` and the `qualifies <version>` command to `scripts/bootstrap-lib.mjs`, reading `coverage.config.json` and `engines.node` through `node-version.mjs`.
- [x] 1.2 Replace the hardcoded `qualifies` in `scripts/bootstrap.sh` with a call to that command on the candidate runtime.

## 2. Remove the dead path

- [x] 2.1 Delete `selectNodeCandidate` and its two tests.
- [x] 2.2 Point the `bootstrap-lib.mjs` header at the `qualifies` command as the single rule.

## 3. Cover the fallback

- [x] 3.1 Add a shell test where `engines.node` outruns the host: a `curl` probe records the pinned download and no runtime is executed.
- [x] 3.2 Add a shell test where the host satisfies `engines.node`: no download, and the host runtime runs `bootstrap.mjs`.
- [x] 3.3 Add `qualifies` command tests for satisfying, failing, malformed and unsupported-range input.

## 4. Verify

- [x] 4.1 Run `node --test test/bootstrap.test.mjs`.
- [x] 4.2 Confirm the new assertions fail with `scripts/bootstrap.sh` and `scripts/bootstrap-lib.mjs` stashed.
- [x] 4.3 Run `openspec validate fix-bootstrap-node-range --strict` and `/tmp/b3/gates.sh fix-bootstrap-node-range`.
