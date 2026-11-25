# Report the entrypoint stderr when a signal run fails

## Why

A `verify` run on 2026-11-25 failed once out of 1601 tests: the scoped `SIGTERM` lifecycle test found `openspec-flow-run-XDNHJA` still in its probe directory after the entrypoint exited 143. The failure passes the child's stderr to the exit-status assertion but not to the assertion that the run root is gone, so the log shows only the surviving directory name. The entrypoint reports a cleanup failure on stderr, and the run-root assertion has to carry that line: a reported cleanup error and a root left by another writer need different fixes, and the current message hides which one happened.

## What Changes

- Both `SIGTERM` lifecycle tests report the captured entrypoint stderr in the messages of their exit-status and run-root assertions.
- One render helper produces that text as `entrypoint stderr: <text>`, bounded to 500 characters, with `entrypoint stderr: <empty>` for an empty capture; a second drain helper reads the capture when the child's stderr closes or 500 milliseconds after the exit, whichever happens first, so a cleanup line written just before the exit is not truncated and a descendant holding the pipe cannot hang the file.
- Both helpers carry plain tests in the same file: a stream that never closes yields its data after the bound, an empty capture renders the empty marker, and a capture over 500 characters is truncated.
- The plain `SIGTERM` lifecycle test starts capturing stderr; today it discards the child's output.
- No production code, entrypoint behavior, exit-status expectation or documented cleanup contract changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: adds requirements for a failing signal lifecycle assertion to report the entrypoint stderr in a stated form, and for the capture to be read after stderr closes with a bounded wait.

## Impact

- `test/run-root-lifecycle.test.mjs` only.
- No plugin runtime, tool surface, configuration, dependency, README or bundle change.
