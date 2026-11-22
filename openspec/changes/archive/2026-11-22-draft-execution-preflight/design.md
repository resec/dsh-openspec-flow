# Design: Draft execution preflight

## Context

Draft review already runs one host preflight: it reads the change deltas and the related main specs, classifies requirement-description length, records `length` on the draft record, renders a brief section, and blocks readiness. The first apply entry and the apply review entry recheck the same result. See [proposal.md](proposal.md) for why a second preflight is needed.

The bundled CLI's change validation reads the main specs for the scenario-loss check, but it skips a MODIFIED requirement whose current block is absent; the archive merge then fails with `MODIFIED failed ... not found`. The apply reviews in the last week also show the path gap: tasks claimed verification on files that did not exist. `tasks.md` is the execution contract, and its file references are backticked paths.

## Goals / Non-Goals

Goals: one deterministic preflight that resolves requirement anchors and task execution paths, records the result, gates readiness, and rechecks at the same three points as the length gate.

Non-Goals: proposal Impact and tasks file-list agreement, design.md path scanning, automatic artifact fixes, a new tool or parameter, a record schema version bump.

## Decisions

### One pure classifier

Add `lib/review/preflight.js` exporting `classifyExecutionPreflight({ deltas, mainSpecs, tasksText, pathExists })` and renderers for the brief section and the refusal message. It is pure: `lib/tools/review.js` reads the CLI projections, the tasks file and the filesystem, and passes them in. This keeps the classification unit-testable without a fake Host or a real CLI.

`mainSpecs` is a `Map` from capability id to an array of requirement projections, or `null` when the main spec file is absent. `pathExists` is a function so the module does not import `node:fs`.

Alternative: put the checks in `review.js`. Rejected because the path and anchor rules need focused unit tests and the tool module is already large.

### Shared requirement resolver

Move the rename-aware resolver from `lib/review/length.js` into a new `lib/review/requirements.js`: index main-spec requirements by name, build the per-spec `to -> from` rename map, and resolve a name through pending renames. Both the length gate and the anchor preflight import it.

The anchor check uses the same resolution as the length gate, so a MODIFIED name that is a rename target resolves through its source in both. A missing main spec is represented as `null` and reported as one blocking issue per anchoring delta.

Alternative: duplicate the resolver in `preflight.js`. Rejected because two copies of rename handling can drift, and the length gate's behavior is already tested.

### A missing baseline another change supplies

A change may legitimately modify or remove a requirement that another change in the same repository adds while that change is still unarchived. The main spec lacks the name, and no edit to this change can add it; blocking is still correct because this change cannot apply until the dependency exists. The gate therefore keeps the issue blocking and the refusal names both clearing routes:

- incorrect or missing name: fix the artifacts and resume the draft review;
- name supplied by another unarchived change: wait for that change to archive, then resume the draft review.

The preflight does not scan other changes to tell the two apart. The message names both routes and the user decides; the alternative was to scan every active change's ADDED and RENAMED targets, which adds a second parser and a main-worktree read without changing the correct outcome. The design records this as a deliberate trade-off, not a dead end.

### Task path rule

Scan `tasks.md` line by line and extract backticked code spans that start with `test/` or `scripts/`. Strip a trailing `:line`. Skip a span containing glob or placeholder characters (`*`, `?`, `[`, `]`, `{`, `}`, `<`, `>`, `$`), an absolute path, or a `..` segment.

A path that exists at the project root passes. A missing path passes when any clause that names it declares creating, deleting, renaming or moving it. Split the line on `;`, `；`, `。` and `. `; test the clause containing the path. Match the English verbs `add`, `create`, `write`, `introduce`, `new`, `delete`, `remove`, `rename`, `move`, `retire`, `drop`, `generate` on word boundaries; match the Chinese verbs `新增`, `添加`, `创建`, `写入`, `删除`, `移除`, `重命名`, `移动`, `生成` as substrings.

Only `tasks.md` is scanned. The proposal and design are narrative; a path there is not the execution contract, and scanning them produced false blocks on illustrative names.

Alternative: require every new path to be listed in `proposal.md` Impact. Rejected because existing plans name new tests only in tasks, and the declaration already lives in the task wording; requiring a second list adds plan churn without more precision.

### Record, brief and gates

Record `execution` on the draft record next to `length`: `{ blocking, issues }`. The field is additive; a legacy record without it passes.

`lib/review/readiness.js` adds a reason when the draft review is not apply-started and `execution.blocking` is true, and includes that condition in `needsRound`, so a no-finding block names draft `resume` instead of `dispose`. After apply starts the recorded result stops gating the draft, matching the length gate.

`lib/review/brief.js` renders `## Execution preflight` only when issues exist. Each row names the finding kind, the artifact, the requirement or path, and the reason.

The three gate points mirror the length gate:

- draft `start`/`resume` records the result and opens the round; readiness blocks.
- the first `openspec_apply_next` before apply starts recomputes under the review lock, writes the result, and throws on a blocking result.
- apply review `start`/`resume` recomputes before opening the round and throws on a blocking result. This covers a plan change made during apply.

No new tool argument is added. The refusal message lists the issues and names `openspec_review action=resume review=draft` for the draft path, and the apply review names its own resume action.

### Error and brief text

The refusal lists each issue as `- <artifact>: <name or path> (<reason>)`, then the clearing routes: fix the artifacts and resume; for an anchor another unarchived change supplies, wait for that change to archive and resume. It does not propose an automatic edit.

The apply review brief does not render an execution table. A blocking result refuses the round before it opens; a non-blocking result has no rows. This keeps the apply brief focused on the committed tree, while the draft brief carries the full table.

## Risks / Trade-offs

- A task that creates a test without a creation verb is blocked until the wording says so. The message names the path and the accepted verbs; this is the intended convention. False blocks are cleared by a one-word edit, and the draft review still catches semantic gaps.
- A missing path may be a deliberate later-removal target. The deletion, rename and move verbs cover it; a task that only verifies a file deleted elsewhere without saying so is a real plan gap.
- Rename chains are resolved from all RENAMED deltas in the change, independent of file order. A cycle is bounded by a visited set.
- The apply review check reads the worktree change directory and project root. The review object is the committed tree, so an uncommitted new path could pass the preflight while the committed tree lacks it. The existing clean-tree gate still owns the object boundary; the preflight is a plan check, not a replacement for the diff review.
- The path scan is clause-level, not path-level: one creation verb in a clause can cover several paths in that clause. This avoids false blocks for compound tasks; the reviewer still checks that each file is real.
- A missing anchor that is a typo and one that depends on another unarchived change produce the same blocking issue. The refusal names both clearing routes; the classifier does not read other changes. If the dependency never archives, this change cannot apply, which is the correct outcome for a real dependency.
- The apply brief has no execution table. A blocking result refuses the round before it opens; a non-blocking result has no rows. The apply reviewer loses the draft table but keeps the gate; accepted.
- A legacy draft record has no `execution` field. It is read as non-blocking; the first resume records one. Rollback is a revert; older code ignores the additive field.

## Migration Plan

Additive field only. No migration, no new file on disk, no state schema change. A change in flight gets the preflight at its next draft resume or at its first apply entry; an applied change gets it at the next apply review round.

## Open Questions

None.
