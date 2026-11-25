# Proposal: land-with-parallel-drafts

## Why

A contributor landing requires the whole main worktree to be clean, so a parallel change's uncommitted planning directory blocks `candidates`, `sync`, `sync-batch`, `plan`, `prepare`, `merge` and `archive`, although those files cannot enter the landing branch or the pushed commit. The archive phase has the same all-or-nothing check but commits from the main worktree, so a parallel draft can block a pull request after it has already merged, and a broad staging command could publish another change's work.

## What Changes

- **Landing tolerance**: `plan`, `prepare` and `merge` treat uncommitted files under another change's `openspec/changes/<name>/` directory as acceptable. They still refuse a path under the landing change's own directory, any path outside every `openspec/changes/` directory, and a non-empty git index. `merge` refuses before `gh pr merge` when the index carries staged changes.
- **Archive tolerance**: `archive` accepts its own post-archive outputs (the source deletions, the archived directory, and the specs of the capabilities the archived change's delta names) and another change's planning directory. It refuses any other path, an untracked source leftover and a staged index.
- **Candidate listing**: the worktree gate blocks only on dirt outside `openspec/changes/`; a parallel planning directory no longer blocks the listing. The main-branch, landing-lock and local-`main`-ahead gates stay.
- **Sync relaxation**: `sync` and `sync-batch` no longer require a clean main worktree. The main-branch, landing-lock and local-`main`-ahead gates stay.
- **Path-scoped archive commit**: `archive <n> --apply` without `--commit` stages only the archived change directory, the `openspec/specs` capability directories the archived change's delta names, and the removal of the source change directory, verifies the staged path set, commits `chore(openspec): archive <change>` with no body, and records the commit. `archive <n> --commit <sha> --apply` remains the verification and recovery path for a commit made elsewhere and verifies that commit's paths.
- **Path hardening**: the archive phase requires exactly one archived directory and rejects `.`/`..` change names before composing paths.
- **Documentation and tests**: the prerequisites, landing sequence and sync-batch text follow the new behavior, and the landing test suite covers the tolerance, the refusals and the path-scoped commit.

## Capabilities

**New Capabilities**: None.

**Modified Capabilities**:

- `pr-review-pipeline` — the candidate listing, landing cleanliness, same-repository sync eligibility, batch sync and archive commit behavior change.

## Impact

Affected code: `scripts/pr-review-land.mjs`; `test/pr-review-land.test.mjs`; `docs/pr-review.md`; `AGENTS.md`.

No `lib/` change, no plugin runtime change, no landing state schema change and no new dependency. The installed plugin, the `openspec_apply_worktree land` path and its archive commit body stay as they are; the contributor landing archive commit stays subject-only.
