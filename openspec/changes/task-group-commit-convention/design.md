# Design: Task-group commits in apply

## Context

See `proposal.md` - Why. Three surfaces carry this repository's process today: `AGENTS.md` (loaded every turn), `openspec/config.yaml` (the project config the CLI reads, whose `operations.apply.guidance` the plugin returns as `guidance`), and `CONTRIBUTING.md` (the external contribution path). The apply review object is one commit plus a tree diff, so neither the plugin nor the reviewer observes commit boundaries; the plugin's shipped apply texts are shared with every project that installs it.

## Goals / Non-Goals

- Goal: an agent sees the group rule before and during apply, and a reader can map the implementation history onto `tasks.md` groups.
- Goal: an external contributor without the plugin receives the same rule.
- Non-Goal: enforcement. No script, hook, test or CI check, as requested: the group boundary is a reading of the history.
- Non-Goal: changing the shipped apply skill, the flow policy or the tool text, which would impose this repository's commit unit on every project.
- Non-Goal: rewriting repository history to fit the new unit. Correcting the boundary on the apply branch before the first review is branch history, not repository history, and stays allowed.

## Decisions

- **`AGENTS.md` carries the operative text.** The convention must reach an agent before it commits, and that file is loaded every turn. A separate document would need a pointer and would be skipped.
- **`openspec/config.yaml` carries the rule as apply guidance.** `operations.apply.guidance` is the project config's channel for repository-level apply conventions, and `openspec_apply_next` returns it as `guidance`, so the rule also arrives at apply start without a second document. A pointer to `AGENTS.md` would add indirection for one sentence.
- **`CONTRIBUTING.md` carries the contributor statement.** The external path is CLI-only and reads that document; it must not depend on `AGENTS.md` or the plugin. The statement covers the group rule and the no-CI-check fact, not the maintainer-only review boundary.
- **The group boundary is the numbered heading.** Groups are `## 1.` through `## N.` in `tasks.md`; a task id's number prefix names its group (`1.1` belongs to group `1`). Unnumbered trailing sections such as `## Workflow follow-up` are not task groups.
- **A commit belongs to one group.** It carries only that group's changes, so no commit combines two groups; a group may still take several commits. The rule is satisfied by committing each group as it completes: a later split of one final tree would need path-level staging and would blur which edit belongs to which group.
- **Attribution follows the files.** A commit belongs to the group whose subtasks name the files it changes. When two groups change one file, the commit's message names the group it carries; the identifier rule bans review identifiers, not task ids, so this is allowed.
- **A missing boundary is corrected before the first review.** When the pre-review read finds a changing group without its own commit, the implementer commits the group's remaining files, or splits the apply branch when the group's edits went into another commit's patch. The apply base stays the seal commit.
- **A review round keeps its own unit.** A finding's fix may touch files from several groups, so review commits follow `Apply review commits address one finding`. The finding-scoped read is limited to commits made since the round's reviewed base, where group commits from the implementation phase are exempt.
- **The check is the changer's log read.** The changer reads `git log <base>..HEAD` before the first apply review and again before land. The reviewer sees the tree and diff only and cannot verify the range.
- **No test.** Nothing observable changes: no command, no output, no file format. The existing document tests assert other sentences; a new assertion would freeze wording rather than behavior.

## Risks / Trade-offs

- A convention without a gate is missed → the changer's read before the first review is the check; the reviewer cannot verify the range and reports tree defects only.
- Three surfaces can drift → each states the same one-sentence rule for a different audience; the operator reads them together before the apply review, and the requirement fixes the content.
- Two groups edit the same file → the attribution rule resolves ownership, and a group commit carries only its own edits.
- A group commit may not pass `npm run verify` alone → the completion gate runs on the final tree, as it already does for finding-scoped review commits.
- Extra history entries reach `main` → land already requires a linear feature history, and each entry maps to one group.

## Migration Plan

Docs-only. The apply commits group 1 (`openspec/config.yaml` and `AGENTS.md`) and group 2 (`CONTRIBUTING.md`) as the convention it adds; archive merges the two deltas. Rollback is a revert of those commits and the archive commit; no state, data or runtime is involved.
