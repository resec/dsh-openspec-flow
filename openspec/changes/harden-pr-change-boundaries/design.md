## Context

See `proposal.md` for the motivation. Current state:

- The repository tracks `openspec/.gitignore` with `.review/`, but the root `.gitignore` has no review rule.
- The plugin's ignore check now skips its nested write when git already ignores the review directory, so a root rule is sufficient for that path.
- `scripts/check-pr-change.mjs` rejects a pull request with zero active changes but accepts several.

## Goals / Non-Goals

**Goals**

- Make the review root ignored by a repository-level rule that a review worktree inherits with the repository.
- Reject a pull request that carries more than one active change, with an error that names them.
- Keep every existing pull request check intact.

**Non-Goals**

- No plugin behavior change; the plugin continues to treat a repository-level ignore as sufficient.
- No change to the contributor review workflow section or the pull request template; the active-change count sentence in `CONTRIBUTING.md` is updated.
- No change to restricted-path or dependency checks; the single-change task check remains and is intentionally skipped when several changes are present.

## Decisions

### Root rule as a second ignore layer

Add `openspec/.review/` to the root `.gitignore` and keep the tracked `openspec/.gitignore`. The nested file remains the project-level contract; the root rule covers a branch or checkout that does not carry it, such as a pull request that deletes the nested file or a sparse checkout. This needs no plugin change because the plugin's `git check-ignore` check already accepts either layer.

Rejected: moving the review root into the git directory. It would remove the worktree dependency but change the record layout and the plugin's documented path for a repository-only benefit.

### Exactly one active change, checked after the zero case

`evaluateChange` keeps the existing zero-change error, then requires `activeChangeNames(paths).length === 1`. The multi-change error names every active change in a stable order. The per-change task loop runs only for a single change; the restricted-path and dependency checks still run for every call, so a multi-change pull request that also touches a restricted path still names that path.

Rejected: allowing several changes and selecting one later. The review, apply lock and archive are keyed by one change; a second change makes the review boundary ambiguous and the apply segment serial across changes.

## Risks / Trade-offs

- An open pull request that already carries two active changes fails the new gate. Mitigation: split it into two pull requests; the error names both changes.
- A fork whose branch predates the root rule does not carry it. Mitigation: the nested ignore file remains tracked and the plugin's check-ignore path still works; the root rule is a second layer, not the only one.
- Duplicate review ignore entries at two levels. Mitigation: both point at the same directory; the nested file stays the project-level contract and the root entry is inert where the nested one exists.

## Migration Plan

No data migration. Rollback is a revert of the implementation commit or commits, including `.gitignore`, `CONTRIBUTING.md`, `scripts/check-pr-change.mjs` and its tests; no stored record depends on the root rule.

## Open Questions

None.
