# Design: Upgrade the bundled OpenSpec CLI to 2.0.0

## Context

See `proposal.md` - Why. Four facts bound the approach, all measured before any edit:

- `scripts/check-cli-contract.mjs --candidate 1.17.0` and `--candidate 2.0.0` both exit 0 against the 1.16.1 baseline, with no field added, removed or retyped on the 19 recorded commands. The plugin's JSON surface does not move.
- Upstream `src/utils/task-progress.ts` was rewritten in 2.0.0: `parseLocatedTaskLines` joins a checkbox's following lines into its description until a paragraph-ending line, while `parseTaskLines` keeps returning `{ done, description }`. Task counting is unchanged, by the upstream comment and by construction: a continuation line never matches the checkbox pattern.
- The plugin's `lib/tasks.js` states that it mirrors `src/utils/task-progress.ts` in 1.16.1, and `lib/state.js` locates a task by comparing the CLI's `tasks[].description` with its own parse at the cached line.
- `npm view @fission-ai/openspec@2.0.0 engines.node --json` returns `[">=22.12.0"]`, unchanged from 1.16.x and below the plugin's `>=24.9.0`, so no runtime floor moves. `node_modules/@fission-ai/openspec/bin/openspec.js version --json` still reports `schemaVersion: 1`.

The plugin already avoids the rest of 2.0.0's breaking surface: `openspec_init` runs `init --tools none --no-animation`, so the CLI never writes the skills or `/opsx:*` command files that 2.0.0 relocates, and the plugin's own skill provider serves the workflow skills.

## Goals / Non-Goals

**Goals**

- Move the pin, its lockfile entry, the version assertions and every recorded version string to 2.0.0 in one reviewed change.
- Keep the plugin's task parse and the CLI's task parse describing the same task text, so the cached line comparison in `lib/state.js` keeps working for a wrapped task.
- Leave every tool parameter, output field name and CLI invocation unchanged.

**Non-Goals**

- Adopting 2.0.0's skills layout, `delivery` retirement or Amazon Q removal. The plugin owns neither.
- Exposing `openspec update --dry-run`, the CLI's new preview, as a tool.
- Repacking and reinstalling the profile bundle; that is the release step after archive.

## Decisions

**Jump straight to 2.0.0, without publishing 1.17.0 in between.** 1.17.0 changes only `openspec update` and command-file generation, and the plugin runs neither, so a 1.17.0 release would ship a plugin identical in behaviour while paying the full edit inventory twice. The two contract checks were still run against both candidates: if the 2.0.0 run had failed, the 1.17.0 result would say whether the break came from the minor or the major. Alternative considered and rejected: a staged 1.17.0 release as a canary. It exercises none of the path that actually moves, because the moved code is the skill installer, not the JSON commands.

**Mirror the parse in `lib/tasks.js` rather than read task text from the CLI.** The alternative, dropping the local description and trusting `tasks[].description`, would leave `findInFile` without its equality fast path and would keep two different notions of a task's `id` in play. With the parse mirrored, the plugin and the CLI agree on the description, the `#N` index and the count, and the diff between the two parsers stays a diff a reviewer can read.

**Copy the upstream patterns verbatim instead of approximating them.** The paragraph-break alternatives, the hard-break lookbehind and the single-space join are reproduced as written, including the comment that explains why a numbered line ends a paragraph. An approximation would pass the obvious test and fail on the input that matters later, and a verbatim copy lets a future upgrade diff the two files directly.

**Keep the version bump in the same change.** The five packaged skills carry `metadata.generatedBy: dsh-openspec-flow@<version>`, which the skill test ties to `package.json`. A change that moves the CLI without moving the plugin version would leave the shipped skills naming a release whose parser does not match theirs.

**Attribute each README payload figure to the version it was measured on.** The figures at `README.md:233-238` come from a 39-task measurement on 1.16.1 whose harness now lives in `dsh-openspec-flow-eval`, so it cannot be re-run from this repository end to end. The one figure this change can measure is measured again on a named fixture: a scratch project from `openspec init --tools none`, one change from `openspec new change measure`, a `tasks.md` of 39 single-line tasks (`- [ ] N.1 Task N`), and `node node_modules/@fission-ai/openspec/bin/openspec.js instructions apply --change measure --json | wc -c`. The README states that shape next to the new figure, and the tool-side figures keep their 1.16.1 attribution rather than being re-labelled. Alternative considered and rejected: substituting 2.0.0 in that section to satisfy a grep, which would present unmeasured numbers as 2.0.0 results.

## Risks / Trade-offs

- **A third-party parser copy drifts silently after the next upgrade.** → The module comment names the upstream file and the version it mirrors; this change's tests pin the 2.0.0 behaviour; the maintainer guide lists the parser as a coupling point to re-diff on every upgrade.
- **A joined description now exceeds `MAX_DESCRIPTION` and is truncated.** → Truncation already exists and reports `descriptionTruncated`; a wrapped task longer than a thousand characters is not new information for the caller. Covered by an existing projection test path, not by a new field.
- **A continuation line is mistaken for a task, inflating progress.** → The two parsers share the same checkbox pattern and the break pattern ends the text at any list item, so a line that matches the checkbox is always a new task on both sides. The regression tests cover a sibling bullet directly under a wrapped task.
- **`npm install` rewrites the lockfile with unrelated churn.** → The lockfile change is reviewed as its own hunk; only the `@fission-ai/openspec` version and integrity entries may move.
- **A test still asserts 1.16.1 somewhere the inventory missed.** → The full suite runs before the change is complete; `test/openspec.test.mjs` and `test/skills.test.mjs` are the two assertions the inventory names, and a stale literal surfaces as a failure, not as a silent pass.

## Migration Plan

The bundled CLI is an internal dependency, so there is no user data to migrate: a project opened with the new plugin runs 2.0.0 commands against the same `openspec/` tree, and the plugin still writes no tool files into it.

Release order follows the maintainer guide: gates, version bump, archive, commit and push, then `npm run bundle:pack -- --force`, reinstall the tarball in the Plugins page and restart the session. Rollback restores `package.json`, `package-lock.json`, the five skills (metadata and the apply skill's verify sentence), `lib/tasks.js`, the test assertions in `test/tasks.test.mjs`, `test/openspec.test.mjs`, `test/skills.test.mjs` and `test/integration.test.mjs`, the `README.md`, `AGENTS.md`, `cordis.patch.yml`, `docs/upgrading-openspec-cli.md` and `docs/upgrading-dsh-runtime.md` edits, then reinstalls and reruns the test matrix.

## Open Questions

None.
