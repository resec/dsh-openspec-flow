# Proposal

## Why

The doctor preflight's browser scenario says the install command sets `PLAYWRIGHT_BROWSERS_PATH` to a path under `.cache/lab/`. The implementation resolves the directory first — `scripts/lab/core/doctor.mjs:232` prefers the environment's `PLAYWRIGHT_BROWSERS_PATH` and falls back to `.cache/lab/pw-browsers` — and `docs/lab.md:9` documents that resolution. An operator following the spec on a machine that already points the variable elsewhere would be told to install browsers into a directory the check never reads.

## What Changes

- State in the missing-browser scenario that the command's path is the resolved browser directory: the environment's value when set, otherwise `.cache/lab/pw-browsers`.
- Keep the requirement description and every other scenario unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `lab-harness`: the browser-binary scenario names the resolved browser directory instead of an unconditional path under `.cache/lab/`.

## Impact

- `openspec/specs/lab-harness/spec.md`: through the delta.
- No implementation change: `scripts/lab/core/doctor.mjs` already resolves the path and `docs/lab.md:9` already documents it.
- `test/lab-doc.test.mjs`: pins the resolved-path sentence in `docs/lab.md` so the document cannot regress to the old wording.
