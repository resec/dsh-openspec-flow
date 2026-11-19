# Proposal: shrink-ci-cjk-font

## Why

The CI lab job's `install CJK font` step dominated its runtime. In run `44451946620` the step took 19m55s of a 22m30s job: `fonts-noto-cjk` is a 61.2 MB archive and the runner downloaded it from `us-east-2.ec2.archive.ubuntu.com` at 52.1 kB/s (`Fetched 61.2 MB in 19min 34s`). The job still passed, but it sits close to its 30-minute timeout, and the same run's `playwright install --with-deps chromium` had already installed `fonts-wqy-zenhei` (7.9 MB), which satisfies the doctor's `fc-list :lang=zh` check just as well.

## What Changes

- The CI lab job installs `fonts-wqy-zenhei` instead of `fonts-noto-cjk` before `npm run lab -- doctor`.
- `test/ci-workflow.test.mjs` asserts the package the workflow actually installs, so the workflow and its test cannot drift.
- The empty-output branch of the doctor's missing-font message names `fonts-wqy-zenhei`, so its correction matches what CI does.
- The `contributor-workflow` capability gains a requirement that the lab job installs `fonts-wqy-zenhei` before the doctor and that the workflow test asserts that package.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contributor-workflow`: adds a requirement that the lab job installs `fonts-wqy-zenhei` before `npm run lab -- doctor` and that the workflow test asserts that package.

## Impact

- `.github/workflows/ci.yml`: the `install CJK font` command.
- `test/ci-workflow.test.mjs`: the lab-job package assertion.
- `scripts/lab/core/doctor.mjs`: the correction-oriented text for a missing CJK font.
- `test/lab-doctor.test.mjs`: a case for the empty-output branch that asserts the package name.
- No dependency, engine, lockfile, `dist/` or plugin-runtime change. `docs/lab.md` and `CONTRIBUTING.md` name no package, so they stay as they are.
- `.github/workflows/` is a restricted path. This is a maintainer-authored change, so it follows the restricted-path rule in `contributor-workflow` and lands on `main` without an external pull request. Running `check-pr-change.mjs` against it would report the workflow path by design.
