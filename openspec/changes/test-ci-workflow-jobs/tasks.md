# Tasks

## 1. Read the workflow per job

- [x] 1.1 Parse `.github/workflows/ci.yml` into jobs and their steps by indentation, and expose helpers that require a command to live in exactly one step of one job.
- [x] 1.2 Assert that the workflow declares only the verify and lab jobs, that both run on Ubuntu, and that no macOS job exists.

## 2. Assert job ownership and order

- [x] 2.1 Assert the verify job's gate order: `npm ci`, change check, generated skill check, `npm run openspec:check`, the requirement-length gate, `npm run verify`.
- [x] 2.2 Assert the lab job's order: the pnpm action, `npm ci`, `fonts-wqy-zenhei`, the Chromium install, `npm run lab -- doctor`, `npm run test:lab -- --mock-only`, and keep the font before the doctor.
- [x] 2.3 Assert that the Chromium install, the CJK font, the doctor and the lab run only in the lab job, and that the verify job sets no `PLAYWRIGHT_BROWSERS_PATH`.

## 3. Assert the workflow invariants

- [x] 3.1 Assert both jobs' `timeout-minutes` and the workflow `concurrency` group with `cancel-in-progress: true`.
- [x] 3.2 Assert that `permissions` grants `contents: read` and no other scope.
- [x] 3.3 Keep the Node pin, change-check environment, maintainer exemption, pnpm pin, lab cache and Node 24 action assertions, scoped to their job.

## 4. Verify

- [x] 4.1 Run `node --test test/ci-workflow.test.mjs`: 12 pass, 0 fail.
- [x] 4.2 Move the CJK font step after `npm run lab -- doctor` and confirm the lab order test fails, then restore the workflow.
- [x] 4.3 Move the Chromium install step from the lab job into the verify job and confirm the lab ownership test fails, then restore the workflow.
- [x] 4.4 Run `/tmp/b3/gates.sh test-ci-workflow-jobs`: strict validation, `openspec:check`, the requirement-length gate, generated skills, `check:pr` and `npm run verify` pass.
