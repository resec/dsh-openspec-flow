# Proposal: add-dsh-lab

## Why

The repository cannot verify DSH behavior on the development host: installing or restarting a plugin there mutates the profile, configuration and sessions the development workflow depends on. The existing suite proves source-level behavior only; it cannot show that a packaged tarball installs, loads, serves the review channel, or renders in the Web GUI. The separate evaluation repository runs a real model and is not a reusable, offline lab.

## What Changes

- Add a lab harness under `scripts/lab/` with a CLI and a Node API: doctor, cache, isolated sandbox, package installation, headless and web drivers, HTTP endpoint calls, mock model, artifact inspection and a report.
- Install the pinned DSH from npm into a cache keyed by DSH version, Node major, platform and architecture. Provide `--fresh-dsh` for a temporary install and `--offline` for cache-only runs.
- Install the plugin tarball into a fresh isolated profile on every run, and verify its bundle selection and composed configuration.
- Add reusable scenarios under `test/lab/*.scenario.mjs`, run by `npm run test:lab`. Scenarios default to the mock model; functions and styles are verified in the isolated Web GUI through Playwright.
- Put one-off POCs under `.cache/lab/experiments/`; they are never collected by `npm test` or the pre-push gate.
- Extend the pre-push gate to run `npm run test:lab -- --mock-only` before the coverage step. `COVERAGE_SKIP=1` continues to skip only coverage.
- Add Playwright as a development dependency and `docs/lab.md`; update `AGENTS.md`, the pre-push hook and its installer text.
- Add the doctor preflight for the repository runtime baseline, the DSH cache state, the Playwright browser binary, browser shared libraries, a CJK font and free disk.

No plugin runtime code, tool schema, review record or card format changes.

## Verification Boundary

The harness verifies install/load behavior, headless events, HTTP endpoints, Web GUI DOM and interaction, card files, turn binding, and host-config immutability inside an isolated DSH and Playwright environment. It SHALL NOT modify the development host profile, configuration or sessions.

The user's self-verification boundary remains the real host: installing or upgrading the plugin in the user's own profile, its long-term stability beside existing plugins and models, and subjective experience such as card density, wording and long-report readability. Real-model scenarios are manual only and are not part of the pre-push gate.

## Capabilities

### New Capabilities

- `lab-harness`: isolated DSH provisioning, package installation, headless and Web GUI driving, mock and real model selection, reusable scenario placement, reporting and the doctor preflight.

### Modified Capabilities

- `development-workflow`: the pre-push gate adds the reusable lab scenarios before the coverage step; the lab gate runs mock scenarios only, ignores POCs, and is not skipped by `COVERAGE_SKIP=1`.

## Impact

- New `scripts/lab/**`, `test/lab/**`, `test/lab-*.test.mjs`, `docs/lab.md`
- New `devDependencies.playwright` and `package-lock.json` update
- Modified `package.json` scripts, `.githooks/pre-push`, `scripts/install-hooks.mjs`, `test/hooks.test.mjs`, `AGENTS.md`, `README.md`
- No changes to `index.js`, `lib/**`, `client.js`, `reviewer.js`, the tool surface, review records or review cards
- The harness writes under `.cache/lab/**`, the isolated DSH homes it creates, and the package manager's shared store or cache; it records the actual store path in the report and never writes the host profile, configuration or sessions. It refuses the default `~/.dsh` home.
