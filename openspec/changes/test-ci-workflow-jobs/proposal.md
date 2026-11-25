# Proposal

## Why

`test/ci-workflow.test.mjs` searched the whole workflow text for most steps, so a command passed the suite no matter which job ran it or where it sat in that job. Moving the CJK font install after `npm run lab -- doctor`, or moving `npx playwright install --with-deps chromium` into the verify job, left every test green. Nothing asserted the two job timeouts, the concurrency cancellation or that CI grants only `contents: read`.

## What Changes

- Read `.github/workflows/ci.yml` by indentation into jobs and their steps, and assert that each step belongs to one job. A command that appears twice, or in the wrong job, fails with the owning job named.
- Assert the step order inside the verify job: `npm ci`, change check, generated skill check, `npm run openspec:check`, the requirement-length gate, `npm run verify`.
- Assert the step order inside the lab job: the pnpm action, `npm ci`, the CJK font, the Chromium install, `npm run lab -- doctor`, `npm run test:lab -- --mock-only`, including the spec's font-before-doctor order.
- Assert both jobs' `timeout-minutes`, the workflow-level `concurrency` group with `cancel-in-progress`, that `permissions` grants only `contents: read`, and that no job runs on macOS.
- Keep the existing coverage, now step-scoped: the Node pin fed into `setup-node` per job, the change-check environment and maintainer exemption, the pnpm pin and its `docs/lab.md` counterpart, the lab browser path and cache keys, and the Node 24 action allowlist counted per job.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `contributor-workflow` already requires the two-job split, the CJK font before the doctor, the pinned pnpm before the doctor and the lab, and the baseline Node pin in both jobs; only the workflow test failed to enforce them per job, so this change sets `skip_specs: true`.

## Impact

- `test/ci-workflow.test.mjs`: a job/step reader and rewritten assertions.
- No workflow, implementation, spec, documentation, dependency, hook, coverage-baseline or `dist/` change.
