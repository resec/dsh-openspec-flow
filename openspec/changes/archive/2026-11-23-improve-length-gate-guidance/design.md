# Design: actionable gate failure output

## Context

See `proposal.md` for why the current output is insufficient. Today `reportBlockers` builds a Markdown table and writes it only to `$GITHUB_STEP_SUMMARY`; the job log receives one annotation per entry, whose properties name the delta file and line, plus `requirement length gate: failed`. The annotation carries no rationale, handling or verification command, and when no summary file is configured the block goes to stderr.

## Goals / Non-Goals

Goals:

- One report text that appears in both the job log and the job summary.
- The report names the edit location and the local command, not just the measurements.

Non-goals:

- Change the classifier, the exit codes, the annotation format, the npm script name or the CI step order.
- Edit the contributor's files or post a pull-request comment.
- Replace the maintainer's review comment; the watch still publishes reports only for reviews that can start.

## Decisions

### Render once, write to both sinks

`reportBlockers` builds one Markdown string and writes it to the log sink, then appends it to `$GITHUB_STEP_SUMMARY` when that path is set. Two renderers would drift, and a test that asserts one text covers both.

Alternative rejected: keep the summary complete and print a short log line. The author reads the log first; a pointer to another tab is the problem this change removes.

### Structure the report around the author's next action

The report carries, in order: a rationale sentence, the entries table, an `Official handling:` block, an `Edit:` list and a `Verify:` line. The rationale takes its number from the classifier report's `limit`, so the limit has one source. The handling text comes from `OFFICIAL_LENGTH_HANDLING`; each edit entry is `openspec/changes/<change>/<issue.path>` plus the line `requirementLocation` resolves, or the file alone when the heading is missing; the command is `npm run check:requirement-length`, the same one the CI step calls.

The renderer is `renderReport(rows, locations, limit)`. `main` passes the classifier's `limit` to `reportBlockers`; `reportBlockers` builds `rows` with `entryRow`, builds `locations` with `requirementLocation`, passes all three to `renderReport`, and writes the returned text to both sinks.

### Print the report on standard output, keep errors on standard error

The report goes to stdout so `gh run view --log` and the job log both show it; local runs show it too. Usage and CLI failures stay on stderr with exit code 2. This changes the current behaviour where an unset summary variable routes the block to stderr; the test that asserted stderr is updated to assert stdout, and the summary file assertion stays.

## Risks / Trade-offs

- A long report makes the log longer → it appears only when an entry blocks, and the passing run still prints one line.
- The edit path is relative to the checkout, which differs from the contributor's working copy → the path inside `openspec/changes/` is stable in both; the line number is recomputed on every run.
- The report is duplicated in the log and the summary → the two are different entry points in the checks UI, and the duplication is deliberate.

## Migration Plan

No state or format migration. After landing, the next CI run prints the new report; reopening a blocked pull request shows it on the existing head. Rollback reverts the renderer and the test assertions.
