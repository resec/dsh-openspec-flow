# Design: add-dsh-lab

## Context

See `proposal.md` for the motivation. The current suite runs source-level tests with a fake Host and the real bundled OpenSpec CLI; it cannot prove that a packaged tarball installs, loads, serves the review channel, or renders in the web client. The host profile must stay stable, so DSH behavior checks cannot run there.

The lab has to provide its own DSH. Measured constraints on the development machine:

- A fresh `@deepseek-ai/dsh` install is about 1.2 GB and takes about a minute; it must be cached by version.
- `dsh plugin add` writes the bundle into `dsh.profile.bundles`; the lab verifies it rather than writing it.
- The pnpm store location is decided by pnpm, not by a lab flag; the lab records the actual path.
- The headless profile has no `agentPresets` service; a reviewer preset row stays pending there. Reviewer-session scenarios therefore belong to the web surface.
- Playwright needs browser shared libraries and a CJK font. Without a CJK font the card labels render as boxes, so the doctor must check it and the lab may point `FONTCONFIG_FILE` at its own font configuration.
- The mock model must answer both streamed and non-streamed requests; session-title generation uses streaming.
- The web startup URL carries a token that exchanges for a cookie; the review-channel envelope is `{type: "client-request", rpcId, method, payload}`.

## Goals / Non-Goals

**Goals**

- One reusable harness for isolated DSH runs, install checks, headless events, web DOM checks, HTTP endpoint checks and mock-driven scenarios.
- Reusable scenarios under `test/lab/`, separate from the daily suite and the affected-test selector.
- One-off POCs under `.cache/lab/experiments/`, never gated.
- Pre-push runs the mock-only lab scenarios before the coverage step.

**Non-Goals**

- No desktop surface.
- No DSH version matrix; only the plugin's `engines.dsh` version.
- No change to plugin runtime code, tool schemas, review records, cards or the shipped package.
- No real-model scenario in pre-push, CI or any non-interactive run.
- No shared sandbox across scenarios in the first version.

## Decisions

### Command surface

The lab exposes one CLI and one test entrypoint; the design names their flags so tasks can verify them:

- `npm run lab -- doctor`
- `npm run lab -- cache list|verify|prune|rm`
- `npm run lab -- up --name <name> --mode web|headless [--keep] [--fresh-dsh] [--offline]`
- `npm run lab -- run --name <name> -- <task>`
- `npm run lab -- exec --name <name> -- <dsh args...>`
- `npm run lab -- inspect --name <name> --all`
- `npm run lab -- down --name <name>`
- `npm run test:lab -- [scenario paths...] [--mock-only] [--include-real-model] [--cleanup] [--keep]`

`test:lab` with no positional arguments discovers every `test/lab/**/*.scenario.mjs`; positional paths filter that set. There is no `--all` flag: default discovery is the full set, and a path outside `test/lab` is rejected. `up` persists an instance under `.cache/lab/instances/<name>/state.json` for `run`, `exec`, `inspect` and `down`. `--keep` keeps the full run directory after a pass; the default removes the isolated home, profile and project after a pass but keeps the report and evidence; `--cleanup` removes the whole run directory after a pass. A failure always keeps the full run directory.

### Independent DSH from npm, cached by version

The lab installs `@deepseek-ai/dsh` at the plugin's `engines.dsh` version with `npm install --prefix` into `.cache/lab/dsh/<version>/<node>-<platform>-<arch>/`. The cache key includes the Node major, platform and architecture because DSH carries native modules. An install is assembled in a temporary directory, verified with `--version`, recorded in `manifest.json`, marked with `.complete`, and atomically renamed. A directory lock serializes concurrent installs.

`--fresh-dsh` installs into the run directory instead and never touches the cache. `--offline` reads only the cache and the pnpm store; a missing entry fails without a registry request. The two flags are mutually exclusive.

`npm install` uses `.cache/lab/cache/npm` through `npm_config_cache`. The pnpm store is chosen by pnpm, not by a lab flag; the lab records the actual store path in the report and treats it as a package cache, not DSH configuration. A run may populate or read that shared store, and the report records that usage instead of claiming every write stays under `.cache/lab`.

**Alternatives rejected:** reusing the development installation would make the result depend on the host install and would not prove a clean install; a version matrix adds cost without a consumer.

### Per-run isolated home, never the host

Each run gets `home/`, `agents-home/`, `project/` and `artifacts/` under `.cache/lab/runs/<id>/`. `DSH_HOME` and `DSH_AGENTS_HOME` point there; `HOME` is not changed, so pnpm and npm caches stay usable. The default `~/.dsh` path is refused. Before and after the run, the lab hashes the host's profile `package.json`, `cordis.patch.yml`, `pnpm-lock.yaml`, credentials and settings; a change fails the run. The generated `cordis.yml` is excluded because DSH rewrites it at profile boot, and sessions and storages are excluded because the host writes them while it runs.

**Alternatives rejected:** copying a host profile would import host state; changing `HOME` would move package caches and make installs slow and surprising.

### The package is installed on every run

Each run creates a new profile, installs the plugin tarball, and checks the profile's bundle list plus `--dump-config` output. The tarball version and sha512 go into the report. Pre-push packs the working tree with `npm pack` into the run directory and records whether the tree was dirty; it does not write `dist/` and does not require a clean tree.

This keeps the lab consistent with `npm test` and `npm run verify`, which also read the working tree. A passing pre-push lab run therefore describes the working tree; the coverage stamp remains the mechanism that describes the committed tree. `--from-head` is deliberately deferred.

### Headless, web and HTTP drivers

- Headless: `dsh --profile verify-headless --json`, parsed into session, status, tool call, tool result, final and error events. The driver exposes the exit status and final reason. A missing credential is reported as a runtime error, not as a load failure.
- Web: `dsh --profile verify-web --port 0 --no-open`; parse the printed URL, open it with Playwright, keep screenshots and collect console errors, page errors and failed requests. Helpers cover the preview notice, the get-started dialog, workspace selection, session opening and sending a message.
- HTTP: obtain the cookie from the startup URL and post the review-channel envelope directly. This covers endpoint behavior without a browser and is the fallback when a DOM check is not needed.

Playwright runs with `PLAYWRIGHT_BROWSERS_PATH` pointing at `.cache/lab/pw-browsers`. The browser binary is installed with `PLAYWRIGHT_BROWSERS_PATH=.cache/lab/pw-browsers npx playwright install chromium`; the doctor checks that executable and runs its library check against it. The lab's font configuration is supplied through `FONTCONFIG_FILE`, so the host font setup is not changed.

### Mock model by default, real model manual only

The default profile points `llm-pi-ai` at a local OpenAI-compatible mock and `agent-default-model` at its model; the launch environment supplies a fake key. The mock answers streamed and non-streamed requests and can be scripted per scenario.

A scenario declares `model: "mock"` or `model: "real"` (default mock). `--include-real-model` is accepted only in an interactive local run; the runner refuses it when `CI`, `GIT_PUSH` or a non-TTY environment is detected. Pre-push passes `--mock-only`; real scenarios are skipped and listed in the report. Real credentials are read from the launching environment and are never copied from the host credential store.

### Scenario and POC locations

- Reusable: `test/lab/**/*.scenario.mjs`.
- Framework unit tests: top-level `test/lab-*.test.mjs`, so they run in `npm test`.
- POC: `.cache/lab/experiments/`, never scanned by `test:lab` or pre-push.

The daily test entrypoint only collects top-level `test/*.test.mjs`, and the affected-test selector uses the same rule, so `test/lab/*.scenario.mjs` is outside both. Coverage already excludes `test/**` and only includes `index.js` and `lib/**`; harness scripts are not part of the plugin coverage floor.

### Pre-push order

The hook runs `openspec:check`, then `npm run test:lab -- --mock-only`, then the existing coverage stamp or `npm run verify`. `COVERAGE_SKIP=1` skips only coverage; the lab gate always runs. The lab gate failing blocks the push before the expensive coverage run.

The cost is bounded by the DSH cache: the first prepared machine installs DSH once, later pushes reuse it. The lab entrypoint runs `doctor` before a scenario starts. `doctor` reuses the repository runtime preflight and checks the cache state, the Playwright browser binary, browser shared libraries, a CJK font and disk; an absent cache entry is reported as will-install, not as a failure.

### Reports and cleanup

Every run writes `artifacts/report.json` plus `manifest.json`, `dump-config.json`, headless events, session logs, card files, screenshots and command logs. The report records versions, cache source, the actual package-manager store path, the dirty paths and `HEAD`, scenario model, checks, evidence paths and the verdict, and never contains a token, cookie or API key. Before a default post-pass cleanup removes the home, profile or project, the run copies the composed configuration, headless events, session logs, card files and screenshots into `artifacts/`, and every evidence path in the report points into `artifacts/`. A failure keeps the full run directory. After a pass, the default keeps the report and artifacts and removes the isolated home, profile and project; `--keep` keeps the full run directory; `--cleanup` removes the whole run directory after a pass.

## Risks / Trade-offs

- **Pre-push gets slower** → cache DSH and the browser; run scenarios serially in the first version; a failure stops before coverage.
- **A machine lacks browser libraries or CJK fonts** → `doctor` fails with the missing prerequisite and an install hint; the gate blocks instead of silently weakening the check.
- **The DSH cache is large** → one version per Node major/platform/arch; `cache prune` and `cache rm`; fresh runs are opt-in.
- **The working tree differs from HEAD** → the lab reports the dirty paths and `HEAD`; push still validates the working tree, matching the existing test and coverage behavior. `--from-head` is a later enhancement.
- **Mock behavior drifts from a real model** → mock scenarios verify plugin behavior, not model quality; real-model scenarios remain manual and are never in the gate.
- **Headless cannot activate the reviewer preset** → reviewer-session scenarios use the web surface; headless scenarios cover tools, files and events.
- **Scenario state leaks if a sandbox is shared** → the first version creates one sandbox per scenario; sharing is a later optimization.
- **Playwright and `package-lock.json` change** → the dependency is development-only; the runtime import check and the packed tarball keep it out of the plugin.
- **The pnpm store lives outside the lab root** → the report records the actual store path and that a run may populate or read it; the host guard treats it as a package cache, not DSH configuration.
- **The browser binary is not installed** → the doctor checks the executable under `.cache/lab/pw-browsers` and names the install command with the same path; the first-run task installs it.
- **README links drift** → the migration plan updates the README file map and documentation links in the same change.

## Migration Plan

1. Add the `scripts/lab/` skeleton, `package.json` scripts and the Playwright devDependency; add the doctor and its unit tests; install the Chromium binary into `.cache/lab/pw-browsers` and verify the doctor finds it.
2. Add the DSH cache, sandbox, host guard, `--fresh-dsh` and `--offline`; verify cache hit, fresh install, offline miss, version mismatch and host immutability.
3. Add package installation, `--dump-config` checks, headless driving and session-log inspection.
4. Add the web driver, Playwright helpers and HTTP endpoint driver; verify onboarding, workspace selection and a page screenshot.
5. Add the mock provider, scenario runner, assertions and report; add one scenario under `test/lab/`; verify report redaction.
6. Update the pre-push hook, `scripts/install-hooks.mjs` text, `test/hooks.test.mjs` call sequences, `AGENTS.md`, `README.md` and `docs/lab.md`; verify a failing scenario blocks the push.
7. Rollback: revert the lab commits; remove the Playwright devDependency and lockfile change; delete `.cache/lab/`; no plugin code or profile is involved.

## Open Questions

None that change the specs or the task breakdown.
