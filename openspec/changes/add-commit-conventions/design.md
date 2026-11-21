# Design: Add commit conventions

## Context

See `proposal.md` - Why. Apply review records rounds and finding ids outside git, `AGENTS.md` carries the instructions an agent reads every turn, and the `development-workflow` capability records the repository's own process. The change edits no plugin code.

## Goals / Non-Goals

- Goal: an agent reads the convention before it commits, and the repository records it as a capability requirement.
- Goal: the operating text refines the generic round-level commit instruction instead of leaving two readings.
- Non-Goal: enforcement in tooling. The convention is prose, with no hook, script or test assertion.
- Non-Goal: changing the plugin's review contract, the packaged skills or `CONTRIBUTING.md`.

## Decisions

- **`AGENTS.md` carries the operative text.** The convention must reach an agent before it commits, and this file is loaded every turn. A separate document would need a pointer and would be skipped.
- **The spec delta sits in `development-workflow`.** That capability already owns the repository's review gates (`Repository changes pass the review gates`); the conventions extend the same gate without changing plugin behavior. `change-review` describes what the plugin does for any project, so a repository-only rule would be misplaced there.
- **The generic round-level instruction stays.** `lib/policy.js` and the packaged apply skill tell every project's agent to commit the round's changes, and three finding-scoped commits still commit the round. The repository states the refinement in `AGENTS.md` and cross-references step 6, rather than editing text every project reads: a packaged-skill or policy change would impose this repository's commit unit on other projects and needs its own `skill-adaptation` delta and tests.
- **The commit unit is checked by reading the log.** The apply review object is the committed tree plus a tree diff (`lib/review/store.js` runs `git diff base target`), so it cannot observe commit boundaries or messages. The maintainer reads `git log <base>..HEAD` before resuming a round and before land, and checks that each commit answers one finding and that no message cites the review.
- **A finding may take several commits.** A later review can overturn an earlier fix, so the rule constrains each commit to one finding, not the number of commits per finding.
- **The seal covers identifiers only.** Existing history is not retrofitted with round numbers or finding ids, and a history rewrite required by `Repository content and history exclude host paths` stays allowed.
- **No test.** Nothing observable changes: no command, no output, no file format. The existing document tests assert sentences this change leaves untouched; a new assertion would freeze wording rather than behavior.

## Risks / Trade-offs

- A convention without enforcement can be missed → the maintainer's `git log <base>..HEAD` check is the gate; the apply review reports tree defects, not the commit unit.
- The generic text could still be read as one commit per round → `AGENTS.md` states the refinement and step 6 points at it.
- A finding spanning commits complicates mapping → each commit restates its defect and carries one finding's changes, so the log reads by content.
- Rework commits add entries → land already requires a linear feature history, and each entry maps to one finding.

## Migration Plan

Docs-only. The apply commits the section; archive merges the delta into `development-workflow`. Rollback is a revert of the section commit and the archive commit; no state, data or runtime is involved.

## Open Questions

None.
