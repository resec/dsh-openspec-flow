# Upgrade the bundled OpenSpec CLI to 2.0.0

## Why

The plugin pins `@fission-ai/openspec` to one exact version and projects that version's JSON and text. The pin is still 1.16.1, so every behaviour OpenSpec fixed after it stays unavailable, and the gap to the current major grows with each release. 2.0.0 is the current release and the last one that changes anything the plugin reads: it installs skills only, which the plugin already avoids, and it reads a task's text as the whole first paragraph instead of its first line.

That second change is the reason this upgrade is not a version-string edit. The plugin's own task parser mirrors the pinned CLI so both sides name the same task, and `openspec_mark_task_done` locates a task by comparing the CLI's description with the one it parsed itself. A wrapped task would stop matching on the first comparison and fall through to weaker lookups, so the parser has to move with the pin.

## What Changes

- Move the `@fission-ai/openspec` pin from 1.16.1 to 2.0.0, and move the lockfile, the version assertions, the five skills' `metadata.upstream`, every pin reference in `README.md` — both tag-pinned tables, the four version descriptions and the test-suite sentence — `AGENTS.md`, `cordis.patch.yml`, the maintainer upgrade guide and the `project-invariants` baseline with it. The README's measured payload figures keep their 1.16.1 attribution; only the `instructions apply` figure is measured again on 2.0.0.
- Mirror 2.0.0's task reading in the plugin's parser: a checkbox's text is its whole first paragraph, following lines join with a single space until a line that ends the paragraph, and a trailing hard break is dropped. Counting does not move: a continuation line is never itself a task.
- Add the regression tests for the joined text, the hard break, a paragraph-ending sibling list item and an unchanged count, plus an integration case that runs the real bundled CLI and asserts the plugin's description equals the CLI's for a wrapped task.
- Update the apply skill's verify sentence, which compares the checkbox line with `next.description`; after this change the description is the whole paragraph, so the comparison has to name the paragraph rather than the single line.
- Bump the plugin to 0.6.0 so the packaged skills' `generatedBy` names the code that ships them, and record the version in the maintainer guide's baseline.
- The tool surface, its parameters and its output fields stay as they are. A wrapped task's `next.description` now carries the full paragraph and can reach the existing truncation limit.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-invariants`: the OpenSpec CLI pin moves to 2.0.0; the schema envelope version stays 1.
- `tool-surface`: task text is the whole first paragraph of a checkbox's Markdown block, matching the CLI, and a task's count is unaffected by continuation lines.

## Impact

- `package.json`, `package-lock.json`: the pin, the plugin version 0.6.0 and its lockfile entry.
- `lib/tasks.js`: the parser gains the paragraph-break and hard-break rules.
- `test/tasks.test.mjs`, `test/integration.test.mjs`: the new parser cases and the CLI-agreement case; `test/openspec.test.mjs` moves both of its `1.16.1` literals, and `test/skills.test.mjs` its `openspec@1.16.1` assertions.
- `skills/*/SKILL.md` (five files): `metadata.upstream` becomes `openspec@2.0.0`, `metadata.generatedBy` becomes `dsh-openspec-flow@0.6.0`; `skills/openspec-apply-change/SKILL.md` also changes its verify sentence.
- `README.md`: every pin reference — both tag-pinned tables, the version descriptions at lines 183, 184, 216, 287 and 289, and the test-suite sentence at line 238 — plus one new sentence carrying the 2.0.0 re-measurement of the `instructions apply` byte count. The measurement-environment line and the tool-side figures stay attributed to 1.16.1.
- `AGENTS.md`, `cordis.patch.yml`, `docs/upgrading-openspec-cli.md` (baseline, coupling inventory and pin references, including the plugin version line), `docs/upgrading-dsh-runtime.md` (its baseline block also names the CLI pin).
- No new dependency, runtime or Host service. The bundled CLI stays a single resolved copy; no command, parameter or option changes.
- Deferred to the release step: repacking the tarball under `dist/` and reinstalling the profile bundle, because the installed copy is frozen.
