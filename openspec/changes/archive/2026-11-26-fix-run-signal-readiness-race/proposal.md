# Proposal

## Why

`test/run-signal.test.mjs` waits a fixed 80 milliseconds before it sends `SIGTERM` to a freshly spawned child, on the assumption that the child has installed its handler by then. Under the coverage run's eight-file concurrency the child's cold start can outlast that interval, so the signal arrives first, its default action kills the child, and `the child survives the ignored SIGTERM` fails. The same assertion failed two CI runs on different commits on 2026-11-25, one of them a docs-only archive commit, so the defect is a race in the test rather than a product regression.

## What Changes

- Replace the fixed wait before `SIGTERM` with a readiness report: the child writes a line after it installs its handler, and the test waits for that line.
- Share one line-reading helper between the ignoring-`SIGTERM` test and the grandchild test that already waits for a stdout line from its child.
- Leave `scripts/run-signal.mjs` unchanged: the entrypoint's process-group behavior is correct, and only the test's synchronization is wrong.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: a test whose child must survive the signal it sends must wait for a readiness line the child writes after installing its handler, instead of a fixed interval.

## Impact

- `test/run-signal.test.mjs` only; no `lib/`, `scripts/`, dependency, workflow, coverage-baseline or `dist/` change.
- Reproduce: with the run pinned to one core (`taskset -c 0`) beside six background busy-loop processes, `node --test test/run-signal.test.mjs` failed the `the child survives the ignored SIGTERM` assertion in eight of ten runs before the change.
