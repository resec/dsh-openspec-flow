# Design: the requirement length gate in pull-request CI

## Context

See `proposal.md` for why the gate moves earlier. This design covers how the script reads the same inputs the plugin reads and how CI reports the result.

The plugin's preflight does two things: it reads the change delta and the related main-spec requirement projections, and it classifies the descriptions against the 500-character limit. The classifier, `classifyRequirementLength` in `lib/review/length.js`, is a pure function. The input loader in `lib/tools/review.js` is not reusable outside the plugin because it needs the plugin's host context, but its two CLI calls are simple and documented in the code.

## Goals / Non-Goals

Goals:

- Run the exact growth rule CI already has evidence for, without a second copy of the rule.
- Fail the pull-request job before any review attempt, so the watch stops selecting the pull request.
- Give the author the same entries and official handling the plugin would give.

Non-goals:

- Replace the plugin preflight; it stays as the last check before an apply round.
- Change the watch, its state, or its comment format.
- Add a new review record, marker or notification path.

## Decisions

### Reuse the classifier instead of restating the rule

The script imports `classifyRequirementLength` and `OFFICIAL_LENGTH_HANDLING` from `lib/review/length.js`. A second implementation would drift: the rename resolution, the legacy exemption and the ADDED-versus-MODIFIED split are subtle, and `change-review` already states them as behavior. The cost is that the script depends on a `lib/` module; the classifier's behavior is specified by `change-review`, so the dependency is on a stated contract rather than an incidental internal.

Alternative rejected: run `openspec validate --all --strict` and rely on it. It reports ADDED descriptions over the limit as a warning but deliberately leaves MODIFIED descriptions alone, which is exactly the case that blocks apply.

### Read the delta and the baselines the way the plugin does

For each active change, run `openspec show <change> --type change --json` and take `deltas`. For each distinct `delta.spec` whose `openspec/specs/<spec>/spec.md` exists, run `openspec show <spec> --type spec --json` and take `requirements`. A missing main spec is recorded as absent, matching the loader. This keeps the CI result identical to the apply preflight for the same tree.

### Resolve the bundled CLI the way the plugin does

The script imports `resolveBundledCli` from `lib/openspec.js` and spawns `process.execPath` with the resolved `bin/openspec.js`, using the scan root as the working directory. A bare `openspec` command would depend on PATH, and the repository forbids PATH and project-local CLI lookup; anchoring the resolution at the repository's own dependency also keeps CI and local runs on the pinned version. `--root` defaults to the repository root and exists for tests and focused runs.

### Scan every active change, with optional `--change` and `--root`

The default scan walks `openspec/changes/*` and skips `archive`, mirroring `openspec validate --all`. A pull request's checkout carries only its own change because the main branch carries no active change, and a PR may touch only one active change. `--change <name>` and `--root <dir>` exist for local and focused runs. Restricting CI to diff paths would need a base SHA and a diff, and would not handle a change whose delta file was already over the limit before the head.

### Report through the job summary and file annotations

The script writes a Markdown block with the blocking entries and the official handling to `$GITHUB_STEP_SUMMARY`, so the author sees the reason and the fix on the checks page. Each blocking entry also emits an `::error file=<delta spec path>::` annotation, because that is the place the author edits; the script locates the `### Requirement: <name>` heading in the delta file so the annotation lands on the requirement line. Locally, without that variable, the same text goes to standard error.

Exit codes are `0` for a passing gate, `1` for a blocking entry, and `2` for a usage or CLI failure. A failure to execute the CLI, parse its JSON or read a file fails closed, so a broken environment cannot turn the gate green.

### Place the step after strict validation

`ci.yml` runs `npm run openspec:check` and then `npm run check:requirement-length`. Strict validation already fails on an over-long ADDED description, so the new step mostly catches the MODIFIED growth. Running after it also means the author sees the validation failure first when both exist. GitHub stops the job at the first failing step, which satisfies the spec's "Strict validation reports an over-long added description" and "Strict validation fails for another reason" scenarios without the script checking it.

## Risks / Trade-offs

- A `pull_request` checkout uses the merge ref, while the watch uses the PR head. The main-spec baselines can differ when the base advanced after the head was pushed. Both sides read the specs from their own checkout, and the difference only matters if the base changes the requirement text itself; the gate states the length it measured, so a disagreement is visible rather than silent.
- Importing a `lib/` module couples the script to the plugin's file layout. The classifier is specified by `change-review`, and a test compares the script's verdict with a direct `classifyRequirementLength` call on the same fixture, so a reorganisation that changes behavior fails the test.
- The new step adds one CLI call per active change to the verify job. With one change per pull request this is two calls, well under a second.
- A contributor cannot add the step to `.github/workflows/` because that path is restricted for external pull requests. The step is a maintainer change, which matches the repository's existing rule that a restricted change is made in a maintainer-authored change.

## Migration Plan

Re-running a completed workflow replays its original event: GitHub keeps the original `GITHUB_SHA` and `GITHUB_REF` and reads the workflow definition from that commit. A re-run of a pull request whose head predates this change therefore executes the old `ci.yml` and stays green, so the rerun cannot make the blocked pull requests fail.

The migration uses a new pull-request event that keeps the head: close and reopen each blocked pull request. A reopen delivers `reopened` to the `pull_request` trigger, the merge ref now carries this change's `ci.yml`, and the new run includes the step. Verify on each new run that its step list names `check:requirement-length`; a run that still lists the old steps means the event replayed an older commit.

Closing and reopening changes the pull request state twice but not its head, commits or review records, so no review round opens and no published comment changes.

Rollback removes the CI step and the npm script; the plugin preflight keeps applying the same rule, so no state needs reverting.
