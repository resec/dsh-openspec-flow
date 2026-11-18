# Proposal: add-contributor-bootstrap

## Why

The repository currently assumes the plugin and DSH are available when a change is planned, reviewed and implemented. External contributors cannot be assumed to have either, and there is no bootstrap, CI gate or contribution contract that lets them produce a reviewable change with the OpenSpec CLI alone. Without those pieces, external contributions depend on maintainer-specific setup and quality cannot be checked consistently.

## What Changes

- Add a `contributor-workflow` capability that defines the CLI-only contribution path, bootstrap, CI gates, generated-skill guards and maintainer review responsibilities.
- Add `CONTRIBUTING.md`, English issue templates, a pull request template and `CODEOWNERS` for maintainer review of restricted paths.
- Add `scripts/bootstrap.sh`, `scripts/bootstrap.mjs`, `scripts/bootstrap-lib.mjs` and `scripts/activate.sh` for macOS and Linux development.
- Add CI jobs on Ubuntu for `npm run verify` and `npm run test:lab -- --mock-only`.
- Add change and generated-skill checks used locally and in CI.
- Update `.gitignore` so OpenSpec-generated skill directories stay out of the repository while the repository's own root skills remain tracked.
- Modify the `development-workflow` apply loop, archive ordering and review gate so a change and its implementation may arrive together in a pull request, with draft review before merge and apply review before archive.
- Add pointers from `README.md` and `AGENTS.md` to the contribution contract, and scope the AGENTS.md runtime rule so bootstrap's read-only host discovery does not contradict it.
- Add npm scripts for the local checks without changing dependency versions.

No plugin runtime code, tool schema, review protocol, dependency version or coverage baseline changes.

## Capabilities

### New Capabilities

- `contributor-workflow`: the CLI-only path an external contributor follows from issue to pull request, the bootstrap that prepares a clone, the CI gates that validate the pull request, the generated-skill guard, and the maintainer's review and archive responsibilities.

### Modified Capabilities

- `development-workflow`: the compact apply loop is scoped to maintainer-authored and plugin-driven apply; an external contribution may merge its active change and archive after merge; the review gate distinguishes maintainer-authored changes, which review before implementation, from external contributions, which review before merge.

## Impact

- New: `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`, `.github/workflows/ci.yml`.
- New: `scripts/bootstrap.sh`, `scripts/bootstrap.mjs`, `scripts/bootstrap-lib.mjs`, `scripts/activate.sh`, `scripts/check-pr-change.mjs`, `scripts/check-generated-skills.mjs`.
- New tests: `test/bootstrap.test.mjs`, `test/check-pr-change.test.mjs`, `test/check-generated-skills.test.mjs`, `test/repo-layout.test.mjs`, `test/ci-workflow.test.mjs`.
- Modified: `.gitignore`, `README.md`, `AGENTS.md`, and the `scripts` entries in `package.json` (dependency versions unchanged).
- Unchanged: `lib/`, `index.js`, `package.json` dependency versions, `coverage.baseline.json`, `dist/`.
