# Design: diff the pull-request head, not the merge commit

## Context

See `proposal.md` for the failure. `changedPaths` in `scripts/check-pr-change.mjs` runs `git diff <base>...HEAD`. On a pull-request run GitHub checks out the merge ref, so `HEAD` is a merge of the current base and the pull-request head; `base` is the commit recorded in `pull_request.base.sha`, which does not move when the base branch advances. The three-dot diff's merge base is therefore the recorded base, and every base commit since then enters the diff. `packageJsonAt(base)` compared with the working-tree `package.json` has the same exposure.

## Goals / Non-Goals

Goals:

- The diff contains only the pull request's own commits, whatever the base branch did since it opened.
- The package.json comparison reads both revisions from git, not the merge checkout.
- Local runs without the new option keep their current behaviour.

Non-goals:

- Change the restricted-path list, the unchecked-task check, the exit codes or the workflow triggers.
- Rewrite history or change how the merge ref is checked out for the other steps.

## Decisions

### Add `--head` with `HEAD` as the default

`changedPaths(base, head, root = ROOT)` runs `git diff <base>...<head>` in `root`; the default keeps a local call anchored at the module's repository root. `parseHead` reads `--head` and falls back to `HEAD`, so a local run behaves as before, while the CI step passes `${{ github.event.pull_request.head.sha }}`. The three-dot merge base of the recorded base and the head commit is the recorded base, so the diff covers exactly the pull request's commits.

Alternative rejected: check out the head commit instead of the merge ref. That changes what `npm run verify` tests, which is deliberately the merged tree, and would need a second checkout.

### Read package.json from both revisions, fail closed on the head

The base snapshot uses `packageJsonAt(base)` and stays `undefined` when the base has no `package.json`, which is the pre-existing allowance for an early repository state. The head snapshot uses the same git read but throws when the revision or the file cannot be read, because today's working-tree read fails the step on the same input and a silently skipped dependency check would be a new way to stay green. Comparing two revisions removes the merge tree from the dependency check.

### Keep the tasks read on the working tree

The change check reads `openspec/changes/<name>/tasks.md` for the changes the diff names. Those paths come from the pull-request head, and the merge tree carries the head's copy, so the working-tree read equals a head read here. Reading from git would add a second failure mode for a file that must exist on disk for the apply flow anyway.

### Reproduce the merge checkout in a fixture repository

The defect only shows when `HEAD` is a merge commit, so the regression test cannot use the repository itself: on a normal branch the three-dot diff already contains only the branch's commits. The test builds a temporary repository with a recorded base, a pull-request branch that passes the change check, and an advanced base that adds a restricted path, then checks out a real merge commit of the two. It copies the script under the fixture's `scripts/` directory so the script's `ROOT` points at the fixture, spawns it there, and asserts that the merge checkout fails without `--head` and passes with the pull-request head. `changedPaths` is exported for the direct assertions.

### Fail closed

A missing `--head` value is a usage error with exit code 2. An unresolvable base or head revision makes `git` fail, the existing catch reports it and the step exits 1. The head `package.json` read throws instead of returning `undefined`, so a head without that file fails the step rather than skipping the dependency comparison. A broken revision never turns the check green.

## Risks / Trade-offs

- A fork pull request needs `pull_request.head.sha`; the event provides it for every pull-request run → no extra permission or checkout change.
- The head commit must be present in the checkout. `fetch-depth: 0` brings it in today through the merge commit's parent, but a later shallow fetch would make `git diff <base>...<head>` fail closed and block every pull request → the workflow test keeps asserting the full-history checkout.
- A local run that omits `--head` on a merge checkout still sees the old behaviour → the option exists for exactly that case, and the CI step always passes it.
- The head commit may not be an ancestor of the base; the three-dot diff then falls back to their merge base, which is still the recorded base when the branch was based on it → same result as a rebased branch.

## Migration Plan

After landing, the next pull-request run uses the new argument; reopening a blocked pull request now runs strict validation and the length gate instead of failing the change check. Rollback removes the option and the CI argument.
