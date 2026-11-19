# Proposal: upgrade-github-actions-runtime

## Why

The verify job now reports `Node.js 20 is deprecated` for `actions/checkout@v4` and `actions/setup-node@v4`, and the lab job uses two more Node 20 actions (`actions/cache@v4`, `pnpm/action-setup@v4`). GitHub removed the Node 20 Actions runtime on 2026-09-23 and forces these releases to run on Node 24 with a deprecation annotation; its migration notice asks workflow authors to move to the latest action versions that declare the Node 24 runtime.

## What Changes

- Upgrade `actions/checkout` from v4 to v7 in both jobs.
- Upgrade `actions/setup-node` from v4 to v7 in both jobs.
- Upgrade `actions/cache` from v4 to v6 in the lab job.
- Upgrade `pnpm/action-setup` from v4 to v6 in the lab job.
- Extend `test/ci-workflow.test.mjs` to assert the exact occurrence count of each action reference (checkout and setup-node twice each, cache twice in the lab job, pnpm once) and that no Node 20 release remains, so reverting any single reference fails the suite.
- Add a `contributor-workflow` requirement that the CI actions declare the Node 24 runtime.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contributor-workflow`: adds a requirement that the CI workflow uses the Node 24 action releases and that the workflow test asserts their versions.

## Impact

- `.github/workflows/ci.yml`: four action names across seven `uses:` references (checkout and setup-node twice each, cache twice in the lab job, pnpm once).
- `test/ci-workflow.test.mjs`: the lab action assertion and a new version assertion block.
- No dependency, engine, lockfile, `dist/`, plugin runtime or lab-scenario change; `docs/lab.md` and `CONTRIBUTING.md` do not name action versions.
- `.github/workflows/` is a restricted path, so this maintainer-authored change follows the restricted-path rule in `contributor-workflow` and lands on `main` without an external pull request.
