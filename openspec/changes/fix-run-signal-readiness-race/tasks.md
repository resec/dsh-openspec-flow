# Tasks

## 1. Readiness handshake

- [x] 1.1 In `test/run-signal.test.mjs` add a helper that reads a child's stdout until a named line arrives: it settles once, resolves with that line, removes its exit listener when the line arrives, and takes a label used in its rejection message so a child that exits first reports the missing line by name; use it in the grandchild test in place of that test's inline reader, keeping the pid parse and the grandchild diagnostic; add a plain test in the same file that spawns a child which exits without writing the line and asserts the rejection names it; verify `node --test test/run-signal.test.mjs` passes on Node 24
- [x] 1.2 Use the helper in the ignoring-`SIGTERM` test: spawn the child with a piped stdout, have it install its handler and then write the readiness line, wait for that line, and only then send the signal; verify the file passes on Node 24, then pin the run to one core with six background busy loops (`taskset -c 0 node --test test/run-signal.test.mjs`) and run it ten times, recording the failing count for `the child survives the ignored SIGTERM` before and after the change

## 2. Verification

- [x] 2.1 Run `npm run verify` on Node 24 and confirm the test summary and the coverage verdict pass; run `npm run test:affected -- test/run-signal.test.mjs` and confirm it selects that file
- [x] 2.2 Run `npm run check:requirement-length` and `openspec_inspect` with `action: "validate"` and `strict: true` and confirm both report no finding

## Workflow follow-up

- Commit the implementation, then run the apply review on the committed tree.
- Archive the change after the review requirements are satisfied.
