# Proposal

## Why

The doctor tests named the prerequisites from the spec but injected the result under test. `checkBrowser`, `checkBrowserLibraries`, `checkDisk` and `checkCache` were never called, so a reworded message or an inverted verdict stayed green. The `browserPresent` case title said the empty directory is absent while the assertion expected it present, and `test/lab-env.test.mjs` and `test/lab-discovery.test.mjs` each carried an assertion that could not fail.

## What Changes

- Call `checkBrowser`, `checkBrowserLibraries`, `checkCache` and `checkDisk` directly from `test/lab-doctor.test.mjs` with temporary directories, injecting `platform` and `PATH` where the function reads them, and assert the status and the detail fragments.
- Rewrite the four doctor cases that injected status and detail through `deps` so they exercise the real functions through `runDoctor`; keep the `formatDoctor` aggregation assertions.
- Rename the `browserPresent` case to the behavior the function actually implements, that the browser root exists, and keep the function.
- Replace the tautologies in `test/lab-env.test.mjs` and `test/lab-discovery.test.mjs` with a real run directory containment check and an exact real-traversal result that excludes the POC.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The doctor requirement and its scenarios already specify the missing-prerequisite messages, so only the tests were missing; this change sets `skip_specs: true`.

## Impact

- `test/lab-doctor.test.mjs`, `test/lab-web-helpers.test.mjs`, `test/lab-env.test.mjs`, `test/lab-discovery.test.mjs`: test assertions only.
- No implementation, spec, documentation, dependency, workflow, hook, coverage-baseline or `dist/` change.
