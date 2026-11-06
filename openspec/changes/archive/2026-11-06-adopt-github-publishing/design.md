# Design: Adopt GitHub publishing

## Context

See `proposal.md` for motivation. The repository is a single-package plugin with a clean `main` branch, no remote, and a local OpenSpec project. SSH access to GitHub works for the `resec` account, and `git ls-remote` against the target repository returns no refs, so the remote repository exists and is empty.

## Goals / Non-Goals

- Goal: one canonical remote (`origin`) over SSH, `main` tracking `origin/main`, and a delivery order that keeps archive commits self-contained.
- Non-goal: CI, release automation, branch protection, or a pull-request workflow. Those are absent today and out of this change.

## Decisions

### SSH remote named `origin`

`git@github.com:resec/dsh-openspec-flow.git` matches the existing host SSH key and avoids storing a token in the repository. `origin` is the conventional name for the canonical remote, so no other name is introduced.

### Publish `main` before the archive commit

`git push -u origin main` runs during apply so the upstream is set and later pushes need no arguments. The archive commit is then pushed on its own, which keeps the first commit visible as the initial import.

### One commit for archive, docs, and merged specs

`openspec_archive` moves the change and merges the delta specs in one operation. Committing the archive directory, `README.md`, `AGENTS.md`, and the merged spec together keeps the history linear and lets a rollback revert the archive as a unit.

## Risks / Trade-offs

- Pushing before the docs are written publishes an intermediate state → accepted; the first push exists only to establish the upstream, and the final push replaces it with the archived result.
- SSH authentication depends on the host key and GitHub access → verified before planning with `ssh -T git@github.com` and `git ls-remote`.
- The spec now names a concrete remote URL, so a future migration must edit the spec → accepted; the URL is the point of the requirement.

## Migration Plan

1. `git remote add origin git@github.com:resec/dsh-openspec-flow.git`.
2. `git push -u origin main`.
3. Update `README.md` and `AGENTS.md` with the contract.
4. Verify with `git remote get-url origin`, `git rev-parse --abbrev-ref main@{upstream}`, `openspec validate`, and `node --test test/`.
5. Rollback: `git remote remove origin` restores the previous state; the remote repository keeps the pushed commits until its owner deletes them.

## Open Questions

None.
