# Design: Await in-process CLI completion

## Context

See `proposal.md` for the failure that motivates the change. The in-process runner in `test/inproc-cli.mjs` currently calls `module.runCli(spec.argv)`, which is the pinned CLI's synchronous `program.parse(argv)` wrapper. The CLI registers asynchronous `.action(...)` handlers, so `runCli` returns before the handler settles. The runner then guesses completion from console activity: a 25 ms quiet window after the first output, or a 2 s grace period when no output arrives.

The pinned CLI (2.0.0, Commander 14) also exports its `program` instance. Commander exposes `program.parseAsync(argv)`, which awaits the asynchronous action. The package export and type declaration both expose `program`, so the runner can await the real command without changing the dependency.

## Goals / Non-Goals

- Goal: make the default in-process path complete only after the command action settles.
- Goal: keep the existing output-based path for fake or older CLI modules that expose only `runCli`.
- Goal: preserve serialization, console capture, working-directory and environment restoration, exit-code reporting, abort handling and the bounded deadline.
- Non-goal: change the production CLI invocation path, the child-process fake, the pinned CLI version or the test concurrency.
- Non-goal: introduce cancellation into the OpenSpec CLI; a deadline remains a terminal outcome for the affected call.

## Decisions

### Prefer the awaitable program entry

The runner will use `module.program.parseAsync(spec.argv)` when `module.program` exposes a function `parseAsync`. After it settles, the runner reads any explicit `process.exit` value, then any changed `process.exitCode`, and otherwise reports 0.

This is preferred over increasing the quiet window or the no-output grace. A larger window only reduces the probability of a race; it cannot prove completion, and it slows every silent command. The awaitable entry removes the heuristic for the normal path.

### Keep the polling path as a fallback

When `program` or `parseAsync` is missing, the runner will keep the current `runCli` call and polling loop unchanged. The fake CLI tests already exercise that shape, and a future CLI export change degrades to the old behavior instead of failing to load.

### Guard both abandoned outcomes

The awaitable path will race `parseAsync` against the configured deadline and the call's abort signal:

- Normal completion resolves the call after the action settles.
- An abort rejects the call with the existing abort error.
- Deadline expiry reports exit code 124, matching the current polling deadline, and then restores the per-call state.

Both the deadline and abort branches abandon the underlying action, because the CLI exposes no cancellation signal. Both branches therefore attach a rejection handler to the abandoned promise, restore the per-call state, and release the serialization gate so the next queued call can start. A late action that writes after restoration affects only an already failed test; it must not hang the queue or become an unhandled rejection.

### Record the CLI coupling

The new dependency on the exported `program` singleton and Commander's `parseAsync` will be added to the CLI coupling inventory in `docs/upgrading-openspec-cli.md`. The row names `test/inproc-cli.mjs`, both APIs, and the fallback check an upgrade must perform. The fallback protects the runner at runtime; the inventory keeps an upgrade from silently restoring the racy path.

### Test both the seam and the real CLI

Fake modules will prove the preferred path, the delayed-output case, the fallback, the deadline and abort outcomes, and exit-code preservation. The abort test also enqueues a following call to prove the gate is released and the process state restored.

A real-CLI test will assert that the pinned package exposes an awaitable entry, inject a loader whose `runCli` throws so a fallback cannot pass silently, and run two commands through the shared real `program`. It will parse both JSON results and verify that each call's output stays isolated.

The tests live in `test/inproc-cli.test.mjs`; no new test file or fixture is needed. The child-process contract in `test/spawn-contract.test.mjs` remains unchanged.

## Risks / Trade-offs

- A stalled awaitable action cannot be cancelled; the deadline still has to release the queue and restore globals. The call fails with 124, as the polling path already did. The late action may still write after restoration, but only after a test failure has been reported.
- The real CLI retains Commander state on its singleton `program`. Repeated calls could expose stale option values. The repeated real-CLI test covers the commands used by the review suites; the fallback remains available if a future upgrade changes this behavior.
- `parseAsync` is a Commander API rather than a bespoke export. The pinned package declares both `program` and its Commander type; the fallback and the coupling inventory keep an upgrade from breaking the runner silently.

## Migration Plan

No runtime migration. The change is limited to test infrastructure and one upgrade-inventory row, and lands with the suite. Rollback is a revert of the commit; the fallback path remains available in the same commit.

## Open Questions

None.
