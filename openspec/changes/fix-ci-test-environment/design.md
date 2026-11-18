# Design

## Context

See `proposal.md` for the failure. The review, inspect and integration tests copy a probe project from a sibling `.probe` directory. The lab's `install-smoke` scenario runs `dsh plugin add`, and DSH's plugin manager forwards to `pnpm add`; the Ubuntu runner has Node and npm but no pnpm, while the doctor reports ready. This workstation passes because it has the sibling directory and a global pnpm 12.6.0.

## Goals / Non-Goals

### Goals

- A clean Ubuntu checkout passes `npm run verify`.
- The lab job passes on a runner that provides Node but not pnpm.
- One shared fixture path serves every review consumer.
- The doctor and the workflow tests fail when any of these assumptions returns.

### Non-Goals

- Changing runtime behavior, public APIs or dependency versions.
- Adding a macOS CI job.
- Installing pnpm in bootstrap; the doctor reports the missing prerequisite and the documented install command is the correction.

## Decisions

### Decision: Track the probe fixture and use one shared path

Move the eight files from the sibling `.probe/proj/openspec` directory to `test/fixtures/probe/openspec/`. Change `PROBE_ROOT` in `test/review-fixtures.mjs` to `fileURLToPath(new URL('./fixtures/probe/openspec', import.meta.url))`, keeping it a string. Make `test/inspect.test.mjs` and `test/integration.test.mjs` import `PROBE_ROOT` from `./review-fixtures.mjs` and delete their local constants. Remove `fileURLToPath` from `test/integration.test.mjs` only; `test/inspect.test.mjs` still uses it for the skills, policy and README paths.

Extend `test/repo-layout.test.mjs` with one test that:

- imports `PROBE_ROOT` and asserts it starts with the repository root;
- reads every top-level `test/*.test.mjs` module except `test/repo-layout.test.mjs` itself and fails, naming the module, when it contains a literal `.probe` path or declares its own `PROBE_ROOT` with `const`, `let` or `var`; importing the shared `PROBE_ROOT` is allowed;
- runs `git ls-files test/fixtures/probe/openspec`, normalizes both that output and the files found under `PROBE_ROOT` to repository-relative paths, and asserts the sets are equal and contain eight files;
- skips only when `git rev-parse --is-inside-work-tree` fails, so a present but untracked fixture still fails.

The single shared constant removes the two duplicated definitions, and the scan catches a later test that reintroduces a local path. Excluding the scanner prevents its own filter text from matching. The normalized set comparison catches a partial `git add`.

Alternative considered: generate the fixture in a helper. Rejected because the files are static and the tests assert on their exact task and spec text; a tracked fixture is simpler to review and update.

Alternative considered: keep the sibling directory and document it. Rejected because a clean checkout cannot reproduce CI.

### Decision: Install pnpm in the lab job with `pnpm/action-setup@v4`

Add the action after `actions/setup-node@v4` and before `npm ci` in the `lab` job, with `version: 12.6.0`, the value exported as `PNPM_VERSION` and the version that passed the local lab. The workflow test extracts the `lab` job block and asserts the action and version appear before `npm ci`.

Alternatives considered: adding `pnpm` as a devDependency (DSH may not have `node_modules/.bin` on PATH); using `corepack` (availability depends on the Node build); and `npm install --global` (global prefix permissions). The action provisions pnpm on PATH without changing the repository's npm dependencies.

### Decision: Check pnpm in the lab doctor

Export `PNPM_VERSION = '12.6.0'` from `scripts/lab/core/doctor.mjs`. Add `checkPnpm(env)` in the same module; it runs `pnpm --version`, catches a start failure and a nonzero exit, and returns a correction-oriented message containing `PNPM_VERSION` and the install command. `runDoctor` includes the check after the runtime check and accepts a `pnpm` dependency override for tests.

`test/lab-doctor.test.mjs` gains the dependency override, a missing-pnpm case with a correction-oriented message, and a direct `checkPnpm` case with a PATH that cannot resolve pnpm. The `deps()` fixture supplies a passing pnpm check so the existing cases stay deterministic. The existing browser assertion moves from `checks[2]` to a lookup by the `browser-binary` name, because the pnpm check shifts the array indices.

Bootstrap does not install pnpm. Its existing behavior is to run the doctor and fail with the doctor's message when a prerequisite is missing; the new check makes that guarantee true for pnpm. The lab remains optional for external contributors, and bootstrap's host-state rule forbids installing packages outside the clone.

### Decision: Bind the documented pnpm version to one exported pin

`docs/lab.md` lists pnpm with the install command `npm install --global pnpm@12.6.0`, states that DSH forwards plugin installation to pnpm, and adds pnpm to the sentence that enumerates the doctor's failures. `CONTRIBUTING.md` adds pnpm to its requirements and lab prerequisites, and the README doctor summary names pnpm.

`test/ci-workflow.test.mjs` imports `PNPM_VERSION` from `scripts/lab/core/doctor.mjs`, then asserts the lab job carries `version: ${PNPM_VERSION}` and `docs/lab.md` carries `pnpm@${PNPM_VERSION}`. The doctor message uses the same constant, so a pin bump changes all three surfaces or fails the tests.

## Risks / Trade-offs

- [The third-party action changes or disappears] -> pin `v4` and an exact pnpm version; the workflow test asserts both.
- [The doctor now rejects a host without pnpm] -> the failure names the install command and the lab remains optional; `CONTRIBUTING.md` states when pnpm is required.
- [The tracked fixture drifts from the CLI behavior the tests expect] -> the suite exercises it on every run; update it with the CLI change that requires new fixture text.
- [A future test reintroduces a sibling fixture path] -> the layout test scans every top-level test module except itself and names the offender.
- [pnpm 12.6.0 becomes incompatible with a later DSH] -> upgrade `PNPM_VERSION` and the workflow with the DSH upgrade that changes the package-manager contract; the workflow and documentation tests keep the pin visible.
- [A partial fixture is committed] -> the layout test compares every fixture file with `git ls-files`.

## Migration Plan

No data or API migration. Reverting the change restores the sibling fixture references, removes the pnpm action and doctor check, and removes the documentation updates; the repository remains buildable either way.

## Open Questions

None.
