# Proposal: harden-development-setup

## Why

On macOS the default temporary directory is a symlink (`/var/folders/...` to `/private/var/...`). Test fixtures use the literal `tmpdir()` value while the bundled CLI reports the canonical path for the same directory, so path-equality assertions fail; the only workaround today is a host-level `TMPDIR` rewrite that no document mentions. Bootstrap also repeats work: it always reinstalls dependencies, and full mode runs the whole suite once for `npm test` and again inside `npm run verify`, so a re-run after a failed Chromium or lab step pays both costs. The Chromium download host, a stale browser installer lock and the lab DSH cache cleanup are not stated in the contribution path, and `CONTRIBUTING.md` never states the coverage thresholds a pull request must meet, so a contributor discovers the new-code function floor only after a failing run. Finally, `AGENTS.md` step 7 says to push `origin/main` without saying that the step belongs to the maintainer, which invites an external contributor to push instead of opening a pull request.

## What Changes

- Normalize the temporary directory for child test processes in `scripts/test-env.mjs`, so fixture roots and CLI-reported roots compare equal on a host whose temporary directory is a symlink. Add a symlink regression test.
- Add `--skip-install`, `--playwright-host URL` and `--reset-browsers` to bootstrap; make full mode rely on the instrumented verification instead of running the plain suite again; report the lab DSH cache location and its prune command when bootstrap finishes.
- Document the coverage gate in `CONTRIBUTING.md`, including the absolute floors, the 1.00 point baseline guard, the new-code thresholds, `npm run verify` and the report-only command; document the new bootstrap options, the macOS download notes and the non-duplicated full mode in `CONTRIBUTING.md` and `README.md`.
- Record the contribution-document snapshot as an explicit exception in `project-invariants`, so the checked copy does not become a second uncontrolled source of the floors.
- Scope the `AGENTS.md` push step to the maintainer and state that an external contribution stops at its pull request.
- Add a documentation test that reads `coverage.config.json`, `CONTRIBUTING.md` and `AGENTS.md`, so a threshold or wording drift fails the suite.

No plugin runtime code, tool schema, review protocol, dependency version, coverage baseline or archived change changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: test entrypoints pass a canonical temporary directory to fixtures; `AGENTS.md` scopes the post-archive push to the maintainer.
- `contributor-workflow`: bootstrap accepts re-run, download-host and browser-reset options and does not run the suite twice in full mode; `CONTRIBUTING.md` states the coverage gate.
- `project-invariants`: the contribution document may carry a test-bound snapshot of the coverage floors, and the capability remains their source.

## Impact

- Test entrypoint: `scripts/test-env.mjs`.
- Bootstrap: `scripts/bootstrap.mjs`, `scripts/bootstrap.sh`.
- Tests: `test/bootstrap.test.mjs`, new `test/test-env.test.mjs`, new `test/contributor-docs.test.mjs`.
- Documentation: `CONTRIBUTING.md`, `AGENTS.md`, `README.md`.
- Specs: a `project-invariants` delta allowing the checked contribution-document snapshot.
- No runtime code, dependency versions, `coverage.baseline.json`, `dist/` or `openspec/changes/archive/` changes.
