# Tasks

## 1. Capture helpers

- [x] 1.1 In `test/run-root-lifecycle.test.mjs` add a render helper that produces `entrypoint stderr: <text>`, truncates the text to 500 characters and produces `entrypoint stderr: <empty>` for an empty capture, and a drain helper that resolves when the child's stderr closes or 500 milliseconds after the exit, whichever happens first; cover both with plain tests in the same file (a stream that never closes yields its data after the bound, an empty capture renders the empty marker, and an over-long capture is truncated to 500 characters); verify `node --test test/run-root-lifecycle.test.mjs` passes on Node 24

## 2. Test wiring

- [x] 2.1 Use both helpers in the scoped `SIGTERM` test: pass the rendered capture as the message of its exit-status and run-root assertions and drain stderr after the child exits; verify `node --test test/run-root-lifecycle.test.mjs` passes on Node 24 and that with `removeRunTempDir` in `scripts/test-env.mjs` temporarily throwing (reverted before commit) the run-root assertion message shows `test entrypoint: cannot remove the run root at`
- [x] 2.2 Use both helpers in the plain `SIGTERM` test: replace its ignored stderr with a captured pipe and pass the rendered capture as the message of both assertions; verify the file passes on Node 24, that with the same temporary throw the run-root assertion message shows `test entrypoint: cannot remove the run root at`, and that with the throw plus a temporary expectation of 0 instead of 143 the exit-status assertion message shows the same line

## 3. Integration

- [x] 3.1 Run `npm run verify` on Node 24 and confirm the test summary and the coverage verdict pass; run `npm run check:requirement-length` and `openspec_inspect` with `action: "validate"` and `strict: true` and confirm both report no finding

## Workflow follow-up

- Commit the implementation, then run the apply review on the committed tree.
- Archive the change after the review requirements are satisfied.
