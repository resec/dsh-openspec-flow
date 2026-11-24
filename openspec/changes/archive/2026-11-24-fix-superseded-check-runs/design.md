# Design: fix-superseded-check-runs

## Context

`checksGreen` is the single rollup judgment in `scripts/pr-review-watch.mjs`; `scripts/pr-review-land.mjs` and `scripts/pr-review-owner-review.mjs` import it. GitHub's `statusCheckRollup` lists every check run attached to the head, including runs superseded by a later workflow run, so the current `every` test stays red after a green re-run. See proposal.md - Why for the motivating case.

## Goals / Non-Goals

- Goal: green means the newest run of every check succeeded, with the same judgment in the watch, owner-review and landing command.
- Non-goal: changing CI workflows, GitHub event-payload handling (a stale `pull_request.base.sha` is a separate, already-mitigated cause), the state file or the number of `gh` calls.

## Decisions

1. **Group by workflow and check name** (`workflowName` + `name`, falling back to `context`) so a same-named check in another workflow cannot mask a failure, while a plain status context keeps its identity. Alternative: group by name alone, which conflates workflows.
2. **Order by usable start time (`startedAt`, else `createdAt`).** A check run carries `startedAt`; a status context carries `createdAt`, so the fallback is what lets a legacy commit status be ordered at all. A queued check run carries the zero timestamp `0001-01-01T00:00:00Z`, which is not a usable start time. The newest run is the one that started last; completion order can invert it when a slow older run finishes after a fast newer one. Alternative: order by completion time, which could pick a superseded success.
3. **All entries at the maximum usable start time must succeed.** Simultaneous or rebuilt runs are treated conservatively instead of trusting array order.
4. **A group containing an entry without a usable start time requires every entry to succeed.** An absent or zero start time means the entry's place among runs is unknown; the strict fallback keeps a queued run from sorting before an older success.
5. **Keep one shared helper.** The spec defines the green-rollup judgment and the superseded-entry rule once for every command that shares `checksGreen`: the watch, owner-review and landing. Landing already requires a green rollup, so no separate judgment is introduced.
6. **A newer entry supersedes an older one regardless of its conclusion**, so a stale success cannot hide a regression and the newest failure stays red.
7. **Do not delete check runs.** Removing a superseded run needs Checks write access and changes CI metadata; the judgment belongs in the watcher.

## Risks / Trade-offs

- GitHub reports a queued check run with the zero timestamp rather than an absent one; the all-success fallback covers both forms. Mitigation: the fallback has its own unit case.
- A status context that carries neither `startedAt` nor `createdAt` cannot be placed among runs; its group keeps the all-success rule rather than guessing from array order.
- Two runs can share a start time; requiring both to succeed can keep the rollup red until a later run starts. This stays on the strict side, matching the current behavior.
- Landing accepts a rollup whose newest run is green even if an older run failed. That is the intended fix; regression tests pin both the broadened and the still-refused cases.
- A check name reused across workflows is tracked twice, so a rollup turns green only when every workflow's newest entry is green. This is stricter than name-only grouping and matches the current all-entry rule.

## Migration Plan

No data migration. The behavior change ships with the tests and the documentation; rollback is reverting the implementation commit.

## Open Questions

None.
