# Tasks

## 1. Upgrade the workflow actions

- [x] 1.1 In `.github/workflows/ci.yml`, change `actions/checkout@v4` to `actions/checkout@v7`, `actions/setup-node@v4` to `actions/setup-node@v7`, `actions/cache@v4` to `actions/cache@v6`, and `pnpm/action-setup@v4` to `pnpm/action-setup@v6`. Verify with `grep -n "uses:" .github/workflows/ci.yml` showing the four new versions and no `@v4` action reference.
- [x] 1.2 Update `test/ci-workflow.test.mjs`: change the existing pnpm assertion to `pnpm/action-setup@v6` and add a case that counts each action reference — 2 for `actions/checkout@v7`, 2 for `actions/setup-node@v7`, 2 for `actions/cache@v6`, 1 for `pnpm/action-setup@v6` — and asserts no `actions/checkout@v[0-4]`, `actions/setup-node@v[0-4]`, `actions/cache@v[0-4]` or `pnpm/action-setup@v[0-4]` reference remains. Verify with `node --test test/ci-workflow.test.mjs`.

## 2. Verify the change

- [x] 2.1 Run `npm run openspec:check` and confirm the change and the main specs validate strictly.
- [x] 2.2 Run `npm run verify` on Node 24 and confirm the test summary passes and the coverage verdict reports no violation.
- [x] 2.3 Inspect `git diff --stat` and confirm only `.github/workflows/ci.yml` and `test/ci-workflow.test.mjs` changed outside `openspec/changes/upgrade-github-actions-runtime/`.

## Workflow follow-up

- `.github/workflows/` is a restricted path; this maintainer-authored change lands on `main` without an external pull request, as the `contributor-workflow` restricted-path requirement records.
- Archive the change after the apply review, then commit the archive with the merged spec and push `origin/main`.
- After the push, confirm both CI jobs succeed and that the run carries no Node 20 deprecation annotation.
