## REMOVED Requirements

### Requirement: Labeled pull-request landing

**Reason**: This requirement restated the landing duty set that `Label-authorized pull-request landing` in the `contributor-workflow` capability already defines, and it stated a strict subset of it: it never forbade adding or removing `mergeable`, squashing, forcing, creating a merge commit on `main` or touching a fork branch. `scripts/pr-review-land.mjs` implements the larger set, so the narrower copy read as permission for the omitted actions while the two texts could drift apart.

**Migration**: None. Landing a labeled pull request is defined once by `Label-authorized pull-request landing`; a session that lands from this workflow applies that requirement. Maintainer-authored pull requests keep their own flow in `Online local completion via pull request`, which needs no `mergeable` label.
