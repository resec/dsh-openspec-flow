# Tasks

## 1. Lab skeleton and doctor

- [ ] 1.1 Add `scripts/lab/` entry modules, the `lab` and `test:lab` npm scripts, and Playwright as a devDependency; verify `npm ls playwright --depth=0`, `npm run lab -- --help`, and `node --test test/runtime-boundary.test.mjs` pass.
- [ ] 1.2 Implement the doctor checks for the repository runtime preflight, the DSH cache state, the Playwright browser binary, browser shared libraries, a CJK font and free disk; add `test/lab-doctor.test.mjs`; verify a missing font and an unsupported Node version fail, a missing browser binary names the install command, and an empty DSH cache reports will-install instead of failing.
- [ ] 1.3 Install the Chromium binary with `PLAYWRIGHT_BROWSERS_PATH=.cache/lab/pw-browsers npx playwright install chromium`; verify the doctor finds the executable and the documented command uses the same path.
- [ ] 1.4 Add `test/lab/` and `.cache/lab/experiments/` conventions with recursive scenario discovery; add `test/lab-discovery.test.mjs`; verify `npm test` starts no lab scenario and default discovery rejects a path outside `test/lab/`.

## 2. DSH cache and isolated sandbox

- [ ] 2.1 Implement the DSH cache key, manifest, atomic install, directory lock, verification and `cache list|verify|prune|rm`; add `test/lab-cache.test.mjs`; verify the unit tests, a prepared `npm run lab -- cache verify`, and a mismatched-version fixture that fails and names both versions.
- [ ] 2.2 Implement the per-run sandbox and host guard; add `test/lab-sandbox.test.mjs`; verify `npm run lab -- up --name smoke --mode headless`, `npm run lab -- inspect --name smoke --all`, `npm run lab -- down --name smoke`, and a host hash comparison that ignores the generated `cordis.yml`.
- [ ] 2.3 Implement `--fresh-dsh` and `--offline`, including their mutual exclusion; add `test/lab-cache-modes.test.mjs`; verify a fresh smoke run, an offline hit, and an offline miss that fails without a registry request.

## 3. Package installation and headless

- [ ] 3.1 Implement tarball installation, bundle-selection and `--dump-config` verification, the tarball version/sha512 record, and the dirty-path and `HEAD` report fields; add `test/lab-install.test.mjs`; verify an installed profile dump contains the plugin row, a missing bundle fails, and a dirty working-tree fixture records its paths and `HEAD`.
- [ ] 3.2 Implement the headless driver and NDJSON parser for session, tool call, tool result, final and error events; add `test/lab-headless.test.mjs`; verify the parser fixture and a real headless smoke that distinguishes a load failure from a missing-credential error.
- [ ] 3.3 Implement session-log inspection with Node 24 zstd; add `test/lab-sessions.test.mjs`; verify event counts and type queries against a captured session log.

## 4. Web, HTTP and Playwright

- [ ] 4.1 Implement web launch, startup-URL parsing, token-to-cookie exchange and the review-channel HTTP call; add `test/lab-web-http.test.mjs`; verify an endpoint call against a running isolated web instance.
- [ ] 4.2 Implement Playwright helpers for onboarding, workspace selection, session opening, sending and screenshots, with browser and font paths under `.cache/lab/`; add `test/lab-web-helpers.test.mjs`; verify a real page load, a workspace selection and a screenshot.
- [ ] 4.3 Implement the CJK font configuration and the browser-binary/library preflight; extend `test/lab-doctor.test.mjs`; verify a screenshot with the card labels rendered as text and a doctor failure when the font is absent.

## 5. Mock model, runner and report

- [ ] 5.1 Implement the OpenAI-compatible mock provider with streamed and non-streamed replies; add `test/lab-mock.test.mjs`; verify both reply forms and that the profile points at the mock by default.
- [ ] 5.2 Implement `defineScenario`, the scenario runner, assertions, artifact layout and `report.json`, including mock-only filtering, real-model refusal in non-interactive runs, report redaction and the cleanup contract; add `test/lab-runner.test.mjs`; verify a mock scenario passes, a real scenario is skipped in mock-only mode, a failing scenario keeps its full run directory, the report contains no token, cookie or fake key, `--keep` keeps home/profile/project, the default pass copies evidence into `artifacts/` and removes home/profile/project, `--cleanup` removes the whole run directory, and every report evidence path exists after the default cleanup.
- [ ] 5.3 Add a reusable smoke scenario under `test/lab/` that installs the tarball, runs a headless task and opens the web page; verify `npm run test:lab -- test/lab/install-smoke.scenario.mjs` passes with a report and screenshot.
- [ ] 5.4 Add a POC example under `.cache/lab/experiments/` and document the CLI flow in `docs/lab.md`; verify default `test:lab` discovery ignores the POC path.

## 6. Pre-push and documentation

- [ ] 6.1 Update `.githooks/pre-push` to run `npm run test:lab -- --mock-only` after `openspec:check` and before the coverage step, update `scripts/install-hooks.mjs` text, and update the expected call sequences in `test/hooks.test.mjs` for both the normal and `COVERAGE_SKIP=1` branches; verify `sh -n .githooks/pre-push` and `node --test test/hooks.test.mjs` pass.
- [ ] 6.2 Update `AGENTS.md`, `README.md` and `docs/lab.md` with the doctor, cache, scenario, POC and pre-push rules, including the README file map and documentation links; add `test/lab-doc.test.mjs`; verify the documented commands, the mock-only rule and the browser install command are stated.
- [ ] 6.3 Run `npm run test:lab -- --mock-only`, `npm run verify` on Node 24 and `openspec_inspect` with `action: "validate"` and `strict: true`; verify the lab report, the coverage verdict and zero warnings.

## Workflow follow-up

- Apply the change with the installed plugin after this draft review is ready.
- Run the apply review, fix every blocker and archive when the user asks.
- Push to `origin/main` only after archive and the user's request.
