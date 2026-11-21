# Proposal: Add commit conventions

## Why

An apply review reports findings whose records live outside git (under the git common directory or `openspec/.review/`), so a reader of the history cannot resolve a round number or a finding id. Commits in this repository already cite them, such as `fix(review): address apply review round 1 findings`, and remediation lands as one commit per round or split by file type, which hides which change answers which finding. The repository needs one finding per commit, and a history that stands on its own.

## What Changes

- `AGENTS.md` gains a `Commit conventions` section: every apply review commit addresses at most one finding, a finding may take several commits when a later review overturns a fix, no round number, extra-round token, finding id, record path or card file enters committed content, and a finding's substance is restated where the history needs it. Step 6 cross-references the section, so the generic commit instruction is refined rather than contradicted.
- The `development-workflow` capability gains two requirements: finding-scoped apply commits, and review-local identifiers kept out of git.
- The plugin's generic apply texts (the policy, the packaged skill, `skill-adaptation`) stay unchanged: they set the round-level gate for every project, and committing a round as finding-scoped commits satisfies them. No plugin code, test, hook or script changes; existing commits stay as they are.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: add the commit conventions as repository process requirements.

## Impact

- `AGENTS.md`: the new section and one cross-reference in step 6.
- `development-workflow` main spec: the two requirements merge at archive; the change directory adds the proposal, design, delta spec and tasks.
- No plugin code, test, hook, script, packaged skill, policy text or review record changes; existing commits are untouched.
