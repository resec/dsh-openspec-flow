## Why

An external pull request is reviewed on its branch, and a branch or checkout can carry the repository without the nested `openspec/.gitignore` (for example a pull request that removes it or a sparse checkout). A repository-level rule keeps the review root ignored in that case, so the plugin can open a review without writing an untracked file. Separately, the current change gate accepts a pull request that carries several active changes; a review and its apply are scoped to one change, so several changes in one pull request make the review boundary ambiguous.

## What Changes

- The repository root `.gitignore` ignores `openspec/.review/`, alongside the existing nested `openspec/.gitignore`.
- `scripts/check-pr-change.mjs` requires exactly one active change in the pull request, not at least one. A pull request that touches two active change directories fails with both names.
- `CONTRIBUTING.md` states the exactly-one rule, and a documentation test keeps that sentence aligned with the gate.
- Tests cover the root ignore rule and the exactly-one-change refusal.
- Out of scope: the plugin's own review behavior and the pull request template; the contributor-facing review workflow section is documented after the review workflow is complete.

## Capabilities

**New Capabilities**: None.

**Modified Capabilities**:
- `contributor-workflow`: the pull request gate requires exactly one active change.
- `development-workflow`: the repository root ignores the review root as a repository-level rule.

## Impact

- `.gitignore`: one new entry.
- `CONTRIBUTING.md`: the active-change count sentence.
- `scripts/check-pr-change.mjs`: the active-change count gate.
- `test/check-pr-change.test.mjs`, `test/contributor-docs.test.mjs` and `test/repo-layout.test.mjs`: the exactly-one, documentation and root-rule assertions.
- `openspec/specs/contributor-workflow/spec.md` and `openspec/specs/development-workflow/spec.md` via the delta specs.
- No dependency, runtime or plugin-surface change.
