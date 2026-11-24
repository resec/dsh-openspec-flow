# Proposal

## Why

`scripts/bootstrap.sh` decided whether a host runtime was usable with a hardcoded rule: major 24 and minor at least 9. `package.json`'s `engines.node` is the declared requirement, and the specification already says bootstrap resolves "a Node 24 runtime satisfying `engines.node`". Raising the floor to, say, `>=24.11.0` left the shell accepting a 24.9.0 host, so bootstrap ran `npm ci` and then `assertCurrentNode()` exited 1 with no fallback.

The range-aware helper `selectNodeCandidate` in `scripts/bootstrap-lib.mjs` was only called by `test/bootstrap.test.mjs`, while its header claimed the shell followed the same rule.

## What Changes

- The shell's `qualifies` no longer encodes a version. It runs `node scripts/bootstrap-lib.mjs qualifies <version>` on the candidate itself, so the primary major and range come from `coverage.config.json` and `package.json` through `scripts/node-version.mjs` — the same module the `bootstrap.mjs` preflight uses.
- Expose `qualifiesHostVersion` plus a `qualifies` command in `scripts/bootstrap-lib.mjs`. Unsupported ranges and malformed versions exit 2 with the range error, so the shell inherits `node-version.mjs`'s semantics instead of approximating them.
- Delete the unused `selectNodeCandidate` and its two tests; the header comment now says where the rule lives.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `contributor-workflow`'s "Bootstrap provisions the toolchain" requirement and its host-runtime scenarios already require the decision to follow `engines.node`, so this change sets `skip_specs: true`: only the implementation lagged.

## Impact

- `scripts/bootstrap.sh`: the `qualifies` predicate and its call site.
- `scripts/bootstrap-lib.mjs`: the runtime verdict, the `qualifies` command, dead-code removal.
- `test/bootstrap.test.mjs`: two shell tests against a temp root with a chosen `engines.node` (a `curl` probe replaces the download), two `qualifies` command tests, and the deleted `selectNodeCandidate` cases.
- No download, dependency, workflow, hook, coverage-baseline or `dist/` change.
