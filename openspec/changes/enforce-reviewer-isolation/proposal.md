# Enforce reviewer isolation

## Why

The `openspec-reviewer` preset only composes scoped tools. The changer tools are registered by the Host row, so an independent reviewer inherits them: a live reviewer session had `openspec_review`, `openspec_apply_next`, `openspec_mark_task_done`, `openspec_archive`, `openspec_new_change`, `openspec_inspect`, `issues_*` and `create_worktree` in its model-facing catalog, while `docs/review.md` says the preset exposes only the read and review tools. The preset declaration is therefore not an effective read-only boundary.

The leaked `openspec_inspect` also explains why a reviewer validates the change itself. The plugin currently runs only a non-strict `openspec validate` at apply review start, while the apply brief asks the reviewer to confirm `strict validation passes`. Once the reviewer can no longer call `openspec_inspect`, that acknowledgement must come from the plugin.

## What Changes

- The `dsh-openspec-flow/reviewer` entry denies every tool registered in the global Host scope by name, except the names the preset itself provides, computed from the live registry rather than a fixed list. Only the preset's `read`, `grep`, `glob`, `web_search`, `web_fetch` and `openspec_reviewer` remain visible; a hidden tool call fails as an unknown tool.
- The deny set is refreshed when the global tool registry changes, so a Host tool registered after activation is denied too. If the initial restriction cannot be applied, the reviewer session is not started.
- Apply review start and resume run `openspec validate` with the strict option on the committed change before opening a round. Strict warnings or errors refuse the round and name the findings; the draft review remains non-strict.
- The apply review brief records the host's strict validation result and states that the reviewer is not expected to run validation. The archive-readiness axis refers to the host check rather than asking the reviewer to perform it.
- Update `docs/review.md`, `README.md`, the reviewer documentation test and the review tests to describe and enforce the effective catalog and the validation ownership.
- The changer's tool catalog, the reviewer preset declaration, the review record schema, configuration and dependencies are unchanged.

## Capabilities

### Modified Capabilities

- `tool-surface`: the reviewer's effective catalog is limited to the preset's read, search, web and reviewer tools; inherited Host tools are denied by name and unknown to the reviewer. The core-tools-to-every-agent requirement is scoped to changer agents.
- `change-review`: apply review start and resume require strict validation of the committed change and carry the result into the brief.
- `review-documentation`: the review document states the reviewer's effective catalog and that strict apply validation is owned by the plugin.

## Impact

- `reviewer.js`: compute and deny the global Host tool names, refresh on `tools/change`, and fail closed when the initial restriction cannot be applied.
- `lib/tools/review.js`: strict option for `validateChange`, apply entry validation, validation-aware brief construction.
- `lib/review/brief.js`: record the host validation result in the apply brief.
- `test/fake-context.mjs`, `test/review.test.mjs`, `test/review-doc.test.mjs`: restriction, refresh, strict flag, brief and documentation regressions.
- `docs/review.md`, `README.md`: reviewer catalog and strict validation ownership.
- `docs/upgrading-dsh-runtime.md`: add the `dsh-tools` restriction/definitions contract and the `dsh-scope` parent-chain coupling to the DSH coupling inventory; update the fake-context stand-in note.
- No new dependency, CLI version change or record-schema change. The restriction affects reviewer sessions created after the Host reload; existing sessions keep their loaded composition.
