# Local PR completion

## Why

Maintainer development currently lands in the plugin worktree and pushes `main` directly, bypassing pull-request CI and the PR review loop. The repository already runs an apply review on the committed worktree tree, but there is no safe path that turns that reviewed tree into a merged PR and archives it afterwards. When GitHub is unavailable, the same development must still finish at local `main`.

The apply review reviews a tree, not a commit. A GitHub rebase merge keeps that tree while rewriting the commits, so the reviewed worktree can be retargeted to the merge commit and completed with the existing `openspec_apply_worktree land`; no plugin change is needed. This also preserves the reviewer session and the worktree until the change is archived.

## What Changes

- Add a local PR path after apply review: publish a PR, acquire the cross-session `landing.lock` after publication and before the final landing work (including the landing CI when a head is rebased), merge with `gh pr merge --rebase`, retarget the reviewed worktree to the merge commit, complete with the existing `openspec_apply_worktree land`, and push the archive commit with `push-landed`.
- Add an offline path: when GitHub is unreachable, run the local lab, land locally, archive and stop at local `main`; the push is deferred until GitHub returns, and a local `main` ahead of `origin/main` blocks new online PRs and contributor landing.
- Classify patrol candidates: local PRs are owner-managed and excluded from review and landing; contributor `mergeable` landing precedes contributor review; unfinished landing phases resume first; merge, archive and push happen in one locked run.
- Remove the lab step from the pre-push hook. The remote `lab` CI job guards pull requests and `main`; the offline path runs the lab locally.
- Preserve the current contributor rules: `mergeable`, trusted pass, same-repository `sync`, fork refusal, fixed-session reviewer reuse and the labeled rebase landing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-pipeline`
- `development-workflow`

## Impact

- New scripts: `scripts/pr-review-lock.mjs`, `scripts/pr-publish.mjs`, `scripts/pr-local-land.mjs`.
- Changed scripts: `scripts/pr-review-watch.mjs`, `scripts/pr-review-land.mjs`, `scripts/pr-review-owner-review.mjs`, `scripts/check-pr-change.mjs`, `.githooks/pre-push`, `scripts/install-hooks.mjs`, `package.json`.
- Changed CI: `.github/workflows/ci.yml` passes the maintainer restricted-path exemption only to a same-repository `resec` pull request, so a maintainer pull request that carries `.githooks/` or workflow changes can reach green CI while an external or fork pull request is still refused.
- New `docs/local-pr.md`; updates to `docs/pr-review.md`, `docs/land-push.md`, `docs/lab.md`, `README.md` and `AGENTS.md`.
- New tests for the lock, publish, retarget/land, patrol exclusion and ordering, offline routing, the hook and the maintainer change-check exemption; updates to the existing PR review, change-gate and lab-doc tests.
- No plugin runtime changes: no `lib/`, `index.js`, `client.js`, skill, schema or tarball change.
