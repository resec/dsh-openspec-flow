# Proposal: Await in-process CLI completion

## Why

The in-process CLI test runner decides that a call has finished by watching console output: a quiet window after the first output, or a fixed grace period for a command that prints nothing. The pinned CLI's command actions are asynchronous, so a slow command can still be running after either window closes. A CI run then read incomplete output: an archive call returned an empty result and a status call was parsed before its JSON was complete. The runner must wait for the command itself, not infer completion from timing.

## What Changes

- Prefer the pinned CLI's exported `program.parseAsync` entry in the in-process runner, so the call resolves after the asynchronous command action settles.
- Keep `runCli` plus the existing quiet-window and no-output polling as the fallback for a CLI module that does not expose an awaitable entry.
- Preserve the current exit-code contract on both paths: an explicit `process.exit` value wins, a returning `process.exitCode` assignment is reported, and the test process state is restored afterwards.
- Preserve the bounded deadline and abort handling around the awaitable path, including releasing the queued call after either outcome.
- Add regression coverage for a delayed asynchronous command, a stalled entry, an aborted entry and repeated real-CLI calls through the shared `program` instance.
- Record the new CLI coupling in the upgrade inventory.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: the in-process CLI runner must wait for an awaitable command action to settle, and may end the call early only through the deadline or abort, while retaining the output-based fallback and the child-process contract.

## Impact

- `test/inproc-cli.mjs`: the shared in-process runner's completion, deadline and abort path.
- Every suite that runs the pinned CLI through the fake context's default in-process mode inherits the new completion path and may see a different runtime; no other test file needs to change.
- `test/inproc-cli.test.mjs`: regression and real-CLI contract coverage.
- `test/spawn-contract.test.mjs`: remains the unchanged child-process contract.
- `docs/upgrading-openspec-cli.md`: one coupling-inventory row for the exported `program` and Commander's `parseAsync`.
- No production code, public tool surface, dependency pin, or child-process fake changes.
