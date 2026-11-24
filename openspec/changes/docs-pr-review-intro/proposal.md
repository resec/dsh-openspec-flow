# Proposal

## Why

The prerequisites section of `docs/pr-review.md` contradicts the implementation and the rest of the document. Its first bullet says the script creates its own checkout and never writes the main worktree, but contributor landing runs in the main worktree: `assertMainReady` requires a clean `main` checkout, `completeMergedLanding` fast-forwards local `main` with `git merge --ff-only origin/main`, and the session commits the archive on `main`. Its second bullet creates the `owner-review` label with the description "require owner review before auto merge", which presents the label as a merge precondition even though the same document says the label is only a queue signal and `mergeable` is the only landing authorization. A maintainer following the prerequisites gets a wrong picture of both the main-worktree writes and the label.

## What Changes

- Reword the main-worktree bullet so it separates the watch, which works in `.cache/pr-review/worktrees/`, from landing, which runs in the main worktree, fast-forwards local `main` to `origin/main` and commits the archive there.
- Change the `gh label create owner-review` description to say the label is a queue signal and `mergeable` is the only landing authorization.
- Add a documentation assertion that pins both phrases and rejects the old wording.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `pr-review-pipeline` spec already requires the watch not to write the main worktree, requires landing to fast-forward `main` after the merge, and requires `owner-review` to be advisory and `mergeable` to be the sole landing authorization. Only the document is wrong, so this change sets `skip_specs: true`.

## Impact

- `docs/pr-review.md`: the two prerequisite bullets.
- `test/pr-review-land.test.mjs`: one documentation test for the landing write and the advisory label.
- No script, test fixture, dependency, workflow, hook, coverage-baseline or `dist/` change.
