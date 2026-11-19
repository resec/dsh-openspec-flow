# Tasks

## 1. Swap the CI font package

- [ ] 1.1 Change the `install CJK font` step in `.github/workflows/ci.yml` from `fonts-noto-cjk` to `fonts-wqy-zenhei`. Verify with `grep -n "fonts-wqy-zenhei" .github/workflows/ci.yml` and confirm `grep -n "fonts-noto-cjk" .github/workflows/ci.yml` prints nothing.
- [ ] 1.2 Update the lab-job package assertion in `test/ci-workflow.test.mjs` to `fonts-wqy-zenhei` and verify with `node --test test/ci-workflow.test.mjs`.
- [ ] 1.3 Update only the empty-output branch of `checkCjkFont` (`scripts/lab/core/doctor.mjs:180`) to name `fonts-wqy-zenhei` while keeping the `FONTCONFIG_FILE` override; leave the `fc-list`-unavailable and `fc-list`-failed branches at lines 174 and 177 generic. Verify by reading the three details and running `node --test test/lab-doctor.test.mjs`.
- [ ] 1.4 Add a `test/lab-doctor.test.mjs` case that stubs `fc-list` on `PATH` to exit zero with empty output, calls `checkCjkFont` and asserts the detail names `fonts-wqy-zenhei` and `FONTCONFIG_FILE`. Verify with `node --test test/lab-doctor.test.mjs`.

## 2. Verify the change

- [ ] 2.1 Run `npm run openspec:check` and confirm the change and the main specs validate strictly.
- [ ] 2.2 Run `npm run verify` on Node 24 and confirm the test summary passes and the coverage verdict reports no violation.
- [ ] 2.3 Inspect `git diff --stat` and confirm only `.github/workflows/ci.yml`, `test/ci-workflow.test.mjs`, `test/lab-doctor.test.mjs` and `scripts/lab/core/doctor.mjs` changed outside `openspec/changes/shrink-ci-cjk-font/`.

## Workflow follow-up

- `.github/workflows/` is a restricted path; this maintainer-authored change lands on `main` without an external pull request, as the `contributor-workflow` restricted-path requirement records.
- Archive the change after the apply review, then commit the archive with the merged spec and push `origin/main`.
- After the push, record the next `main` lab job's `install CJK font` duration and total job duration from the Actions log; the goal is met when the font step no longer dominates the job.
