# Proposal: Sync behind same-repository pull-request branches before landing

## Why

`main` requires status checks to run against the latest base (`strict_required_status_checks_policy`). The review watch reviews and labels pull requests, but the landing command only rebases a local `pr-land/<n>` branch; it never updates the contributor's branch. A labeled pull request whose branch is behind `main` therefore passes the review yet cannot merge: `gh pr merge --rebase` is refused with `head branch is not up to date with the base branch`. Pull request #16 hit this dead end, and every older labeled pull request is in the same position.

The loop also wastes a scheduled run after the final review: `reviewed` and `merge` wait for two separate five-minute deliveries even when the reviewer has already submitted.

## What Changes

- Add `sync <n> [--apply]` to `scripts/pr-review-land.mjs`. For a same-repository pull request whose base is `main`, that carries the `mergeable` label, whose head does not contain the latest `origin/main` and whose update is conflict-free, it updates the branch through GitHub's update-branch API with the current head as `expected_head_sha`. It writes a `sync` record to the landing state, reports the previous and new head, and stops. It never updates a fork branch, never force-pushes, never comments, and leaves the pull request untouched on any refusal.
- `candidates` reports, for every landing candidate, whether the branch is behind and whether it is same-repository, so the scheduled run can choose `sync` instead of `prepare`.
- `plan` and `prepare` require the fetched head to contain the latest `origin/main`. A behind same-repository branch is refused with a sync instruction; a behind fork branch is refused with an author instruction. The local rebase of a behind head is removed because sync makes the head current before preparation.
- `merge` fetches `origin/main` before comparing it with the recorded pre-merge main and requires the head to contain it. A moved main or a stale head records `failed` before any `gh pr merge` call, instead of leaving the landing in an open phase or reaching branch protection.
- After a successful sync the head changes: the trusted pass for the old head no longer covers it, `owner-review` is removed on the head change and is not re-added while `mergeable` is present, `mergeable` is untouched, and the next poll re-evaluates the new head once its CI rollup is green. Only after that pass does the pull request return to the landing candidates.
- The final review and merge are compressed into the same scheduled run: once the final apply review is ready (including across a reviewer wakeup), the run records `reviewed` and runs `merge` without waiting for the next five-minute delivery; archive and push remain a later run.
- Documentation and the scheduled prompt describe the sync command, the same-repository restriction, the latest-main requirement and the compressed final stage. Fork pull requests remain author-updated.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-pipeline`: the scheduled-safety, apply-review-tree, landing-preparation, merge-gate, candidate-discovery and run-sequencing requirements change, a same-repository branch-sync requirement is added, and the rebased-landing-branch requirement is removed.
- `contributor-workflow`: the label-authorized landing requirement gains the same-repository sync permission while keeping fork branches, force, squash and merge commits on `main` prohibited.

## Impact

- `scripts/pr-review-land.mjs`: new `sync` command and CLI usage, pull-request shape fields (`isCrossRepository`, `headRefName`), candidate flags, prepare and merge gates, a merge failure record, and a `sync` record in the landing state.
- `scripts/pr-review-watch.mjs`: no command or state change; a synced head is reviewed by the existing poll once its checks are green.
- `AGENTS.md`, `docs/pr-review.md`, `CONTRIBUTING.md` and the scheduled task prompt: describe the sync authorization, the fork restriction, the latest-main gate, the merge failure record and the compressed final stage.
- `openspec/specs/pr-review-pipeline/spec.md` and `openspec/specs/contributor-workflow/spec.md`: merged through the delta specs of this change.
- `test/pr-review-land.test.mjs`, `test/pr-review-owner-review.test.mjs`, `test/pr-review-watch.test.mjs` and the documentation tests: regression coverage for sync, candidate flags, prepare and merge refusals, merge failure recording, owner-review removal after a head change and the compressed sequence. The two existing prepare-rebase tests are replaced.
- No plugin runtime, tool surface, review-record schema or bundle content changes; the watch and landing scripts are repository tooling.
