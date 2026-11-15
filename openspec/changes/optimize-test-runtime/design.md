# Design: optimize-test-runtime

## Context

See `proposal.md` — Why. Current facts that shape the design, measured on this tree with Node 24.22.2:

- The real OpenSpec CLI costs 133-153 ms per spawn; the suite spawns it 585 times.
- `test/review.test.mjs` holds 106 cases and 465 of those spawns in one file, and Node runs cases inside a file serially. It takes 74.5 s alone, close to the 79.8 s full parallel run.
- `waitReview` loads the change context through one CLI call, then polls with `await sleep(250)`. Three tests use fixed delays (350 ms, 1.5 s, 2 s) before submitting a report, deleting the record or aborting the signal; those delays guard the start of the loop, not the poll interval.
- `scripts/run-tests.mjs` spawns the test runner and passes the current environment to it; CLI children inherit that environment and run with the fixture project as their working directory.
- npm 11 (bundled with Node 24) prints `npm pack --dry-run --json` as an array; npm 12 prints an object keyed by package name.

## Goals / Non-Goals

Goals:

- Overlap the review cases across files while keeping every case and its real-CLI calls.
- Cut the fixed wait time from 3.85 s to about 0.6 s without losing the in-loop branches the three cases cover.
- Reuse compiled bytecode across the hundreds of CLI child processes of plain runs.
- Repair the npm pack assertion without dropping the packed-file check.

Non-Goals:

- No stub, in-process replacement or recorded fixture for the OpenSpec CLI.
- No merge of the review `status` and `validate` calls: `validate --json` does not return `changeRoot`, so one call cannot replace the pair.
- No change to the config schema, the review settings page, the review record format or the tool surface.
- No compile cache during coverage runs.

## Decisions

### Poll interval comes from an environment variable

`OPENSPEC_FLOW_REVIEW_POLL_MS`, default `250`, valid range `10`-`60000`, read inside the wait loop so a test can set it immediately before calling `wait`. A unit test covers the default, an in-range value, a non-numeric value and an out-of-range value.

Alternatives:

- **Public config field** (`reviewPollMs`): the settings page round-trips the whole config; a new top-level field needs page state, `validateConfig`, save-path merging and docs, otherwise saving the page resets it. That is a user-visible surface for a test-only need.
- **`node:test` mock timers**: the wait loop interleaves real file I/O and a CLI spawn from a second tool invocation; ticking mocked time reliably across those boundaries is fragile.
- **Abort-aware sleep only**: it shortens the cancellation case but not the "record disappeared" or "reviewer submitted" cases.

### Three fixed delays become one bounded delay

The 350 ms, 1.5 s and 2 s delays guard the start of the wait loop, so shortening the poll interval alone does not remove them:

- `wait can time out and can return after a later submission`: drop the delay. The report is submitted after the `wait` call starts, and the first loop iteration reads it; with a 10 ms poll the return is prompt either way.
- `wait fails closed when the review record disappears`: keep a bounded 300 ms delay, sized above the measured 133-153 ms context load plus margin, then delete the record so the loop's `current === undefined` branch is still exercised.
- `wait reports cancellation before any deadline`: same 300 ms delay, then abort, so the loop's signal check is still exercised.

Combined idle time falls from 3.85 s to about 0.6 s; a fixed delay remains, by design, because no observable signal tells the test that the loop started.

### Review tests split by topic, fixtures in one non-test module

Four files, grouped by the review surface they exercise:

- `review-draft.test.mjs`: draft start/self-report, findings, policy locking and the draft gate.
- `review-apply.test.mjs`: apply start/status, git tree/base, archive gate and apply round rules.
- `review-reviewer.test.mjs`: the reviewer tool, activation, preset composition, retry/replace/waive-reviewer.
- `review-wait.test.mjs`: wait outcomes, resume behavior and the wait-adjacent round cases.

Shared code moves to `test/review-fixtures.mjs`: `fixture`, `setup`, `call`, `reviewDir`, `writePolicy`, `report`, `majorFinding`, `gitFixture`, `passDraft`, `captureSpawn`, `externalSetup`, the reviewer preset helpers, `PROBE_ROOT`, `CHANGE`, `DRAFT_OPENING`, `CREATED`, plus `cleanupFixtures()`. The module does not end in `.test.mjs`, so `run-tests.mjs` never schedules it as a suite. Each split file imports what it needs and registers `test.after(cleanupFixtures)`.

The split must preserve today's pre-change counts: 106 top-level `test(` registrations in the review file and 412 across `test/*.test.mjs`. The poll unit test added in task 2.1 registers exactly one `test(`, so the post-change suite is 413 cases (the 412 retained cases plus that one). Verification records the pre-split per-file counts and asserts the split files sum to 106.

### Compile cache is absolute and off during coverage

`run-tests.mjs` resolves the cache with `join(ROOT, '.cache', 'node-compile')`, creates it, and sets `NODE_COMPILE_CACHE` only when coverage is not enabled. The absolute value matters: the variable is a directory path read by every Node process that inherits it, and CLI children run with a fixture project as the working directory, so a relative value would write `.cache/` inside test fixtures and make the git fixtures dirty.

The coverage exception follows Node's documented limitation: deserialised bytecode can make V8 coverage less precise, and this repository's gate enforces new-code line, branch and function floors. Coverage therefore runs with the cache variable absent.

### npm pack payload accepts both shapes

`JSON.parse(stdout)` is normalised to a single entry: an array uses its first item, an object uses its first value. The test asserts the entry exists and then keeps the existing file-list checks. Removing the pack call was rejected because the packed file list is the release contract for `files` and `exports`.

## Risks / Trade-offs

- [A split file imports a helper that still lives in another test file] → all shared code moves to `review-fixtures.mjs`; no test file imports another test file.
- [Environment leakage across cases] → each case that sets `OPENSPEC_FLOW_REVIEW_POLL_MS` restores the previous value in a `finally` block.
- [The 300 ms bounded delay is still a fixed wait] → it is stated as such; it stays below the context load bound plus margin and no longer dominates the case.
- [Compile cache hides a stale module in CI] → the cache is keyed by file content and the cache path is inside the ignored `.cache/` directory.
- [Coverage drifts when the cache is enabled] → the coverage entrypoint does not set the variable; task 5.3 checks the gate with the cache absent.
- [Split changes coverage attribution] → coverage includes `lib/**` and `index.js` only; test layout is excluded.

## Migration Plan

One commit: move tests, add fixtures module, add the poll helper and environment read, set the compile cache with the absolute path and coverage exception, fix the pack assertion, update README and `docs/review.md`. Rollback restores the single `review.test.mjs`, removes the environment read and cache lines, and keeps the pack fix if desired.

Verification: `npm test` (413 cases: the 412 retained cases plus the one poll unit test, wall time at most 50 s in the default parallel run), `npm run coverage:check`, `openspec_inspect` with `action: "validate"` and `strict: true`.

## Open Questions

None.
