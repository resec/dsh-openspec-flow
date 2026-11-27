# Design

## Context

See `proposal.md` for the motivation. Today `openspec_review` resolves an apply base once (`lib/tools/review.js`, the base block before the review lock), converts it to a tree with `gitTree`, and renders `gitDiff(baseTreeSha, treeSha)`. The diff is a content comparison of two trees, so it does not notice whether the base commit is still the branch point. The base is the seal commit recorded by `openspec_apply_next` for a draft baseline, or the recorded base for a no-draft baseline; `docs/review.md` explains that the seal ref keeps that commit reachable after a rebase rewrites it.

A rebase (or a merge of main into the branch) replaces the branch's first commit with content from a newer main. The recorded base tree no longer represents "the branch before this implementation", so every main commit that entered the branch appears in the diff. The seal ref still keeps the original commit; the defect is choosing its tree as the diff origin after the branch moved.

Every tree entry runs the same base block, so an apply round and a `pr` round resolve the base through the same resolver; the re-base applies to a draft baseline and to an automatic (`merge-base`) no-draft base.

## Goals / Non-Goals

Goals:

- Keep the "implementation after the sealed plan" diff view across a rebase or a main merge.
- Make the re-base visible and auditable in the record and the brief.
- Leave the explicit `base` override authoritative.

Non-goals:

- Fetching or refreshing `origin/main`; the resolver uses the local ref.
- Changing the seal, the seal ref or the land merge logic.
- Rewriting historical rounds or migrating existing records.
- Changing the tool output schema.

## Decisions

### Decision: Compare the seal's parent with the fork, not the base commit with the fork

The recorded base for a draft round is the seal commit, which lives on the branch and can never equal `git merge-base HEAD origin/main`. The measurable condition is whether the seal's parent is still on the main line below the fork:

- `sealParent === fork`: main advanced but did not enter the branch, so the seal tree is still the correct origin and the diff is already clean.
- `sealParent` is an ancestor of `fork` and differs from it: the branch took in newer main, so the origin must move.
- `sealParent` is not an ancestor of `fork`: the branch did not fork from this main line; keep the seal rather than guess.

Alternative rejected: compare `baseCommit` with `fork` directly. It would re-base on every round, because a seal commit is never the fork.

### Decision: Build the re-based origin by overlaying the seal's paths on the fork tree

The overlay is a temporary index: `git read-tree <fork>`, then `git update-index --index-info` with the mode, blob and path of every entry the seal commit changed (enumerated with the existing `gitCommitPaths`), then `git write-tree`. This is the same temporary-index pattern the seal construction already uses. A path the seal removed is written as a mode-0 `--index-info` line, so the fork's copy cannot survive. After `write-tree`, the resolver checks every path the seal changed: the overlay entry must equal the seal's entry, and `git diff --name-only <fork> <overlay>` must be a subset of the seal's changed paths. A mismatch, an unreadable listing or a failed command returns `undefined`, so the round fails closed instead of recording a fork-only tree that would show the whole change directory as implementation.

Consequences: the re-based tree equals the tree a rebase replay would produce when the replay applies the same paths cleanly; the paths are exactly the change directory and the plugin-written ignore file, so the overlay cannot pull in unrelated main content. The resulting tree is a plain git object referenced by the round record; no commit is created. The recorded base commit itself stays reachable through the seal ref, and the overlaid tree is derived again from the seal and the current fork on every draft-baseline round, so it needs no ref of its own: a `git gc` between rounds can prune it, and the next round rebuilds the same bytes.

Alternatives rejected:

- Find the replayed seal commit by patch id and use its tree. It depends on the rebase preserving the seal commit (an interactive rebase or a squash drops it) and needs a heuristic search over history.
- Fall back to the fork tree. It removes main's advance but also turns the whole planning delta into "added by the implementation", which is a different misreport.

### Decision: Re-base a no-draft base only when it is an automatic ancestor of the fork

A no-draft round may have been started with a deliberately deeper base (a stack, another baseline branch), and a recorded `explicit` source means the caller chose it. Only the automatic `merge-base` fallback carries no caller intent. When the recorded base has source `merge-base` and is an ancestor of the fork, main advanced past it and entered the branch, which is the stale case. When the source is `explicit`, or the base is not an ancestor of the fork, the recorded base stays authoritative and the caller can pass `base` again to move it.

The re-based no-draft origin is the fork tree itself, because a no-draft review has no seal to overlay.

### Decision: Fail closed when the overlay cannot be written

If the temporary index, `write-tree` or the overlay self-check fails, the round refuses with an instruction to pass `base`. A silently different diff would repeat the class of defect this change fixes, and the explicit `base` override is the intended escape hatch.

### Decision: Record `baseSource: "rebase"` and `rebasedFrom`, keep the rest of the shape

The record already stores `baseCommit`, `baseTreeSha` and `baseSource`. The re-base adds `baseSource: "rebase"` and an optional `rebasedFrom` commit; the no-draft case reuses `baseSource: "merge-base"` with `rebasedFrom`. No schema version bump and no tool output field: the brief and the record file carry the audit trail.

The resolver returns the base commit, the base tree, the source and the original commit; the caller keeps writing the three existing fields and the new one. Explicit `base` is evaluated first and never re-based.

## Risks / Trade-offs

- Local `origin/main` is stale → the fork is old and the re-base is skipped. Mitigation: the brief prints the fork commit it used, and `docs/review.md` states that a review after a rebase resolves the fork from the local ref.
- The overlay differs from a rebase replay when main also changed an overlaid path, such as `openspec/.gitignore` → the sealed version wins. Mitigation: the overlayed paths are limited to what the seal changed, and the replay of those paths is what the review should see.
- An in-flight change sees a different diff on its next resume → previously hidden main content disappears and a false finding can become unverifiable. Mitigation: the brief and record name `rebasedFrom`, and there is no historical rewrite.
- `origin/main` is absent in a detached or offline checkout → no re-base. Mitigation: the resolver keeps today's base and the round proceeds.
- `git gc` prunes the overlaid tree between rounds → the record's `baseTreeSha` names a missing object. Mitigation: the resolver derives the tree again from the seal and the current fork on every draft-baseline round, and the round writes its diff before the record is used.
- A path-prefix mistake in a nested OpenSpec root would silently produce a fork-only tree → the whole change directory appears as implementation. Mitigation: the overlay self-check compares the written tree with the fork on exactly the seal's paths and fails closed.
- A rebased extra round's diff no longer shows main's advance, so new main content reaches the reviewer only through the whole-tree statement in the brief. Mitigation: the brief already states that the committed tree, not the diff, is the review object, and the re-based origin is named with `rebasedFrom`.

## Migration Plan

No storage migration: existing records keep their fields and gain `rebasedFrom` only when a re-base happens. The behavior applies from the next `resume`; a passing record whose tree is unchanged returns its recorded brief. Rollback is a revert of the change; the explicit `base` argument remains the manual fallback in either direction.

## Open Questions

None.
