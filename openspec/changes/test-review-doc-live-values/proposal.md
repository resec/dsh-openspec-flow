# Proposal

## Why

`test/review-doc.test.mjs` read `docs/review.md` as text and compared mostly names: the tools, the actions, the configuration defaults and the record layout came from the code, but every number and field name the document states stayed a literal in the test. That covers the 500-character length limit, the `minutes` 1–15 extend bound, the 1–120 `waitMinutes` bound, the three base sources, the stale-round fields, the cross-change refusal and the `validation: … (N issues)` line. A literal that sits in the test and in the document still matches after the code moves, so the document could drift from the implementation and the test would stay green. Only a tool rename, an action rename, a default or a record path was tied to the code.

## What Changes

- Compare the document's length limit with `MAX_REQUIREMENT_DESCRIPTION` instead of the number `500`.
- Read the `waitMinutes` bound from the diagnostic the settings write and the `minutes` bound from the check that `extend` runs, then compare the document's bounds with them.
- Build an apply brief and read the three base source lines and the `validation: … (N issues)` format from the brief itself.
- Close a stale round in a temporary directory and read the cause and the two hash fields it records.
- Submit a finding that names another change and read the report field the refusal points at.
- Keep `checkDocument` the one place that compares the document, so each stale value is reported by name, and add a negative case that widens a bound and expects the stale value.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `review-documentation` already requires the documentation test to fail when a write point, a default or a record name changes; the test was weaker than that requirement, so this change sets `skip_specs: true`.

## Impact

- `test/review-doc.test.mjs`: the live-value probes, the `checkDocument` checks that use them, and one negative case.
- No change to `docs/review.md`, `README.md`, `lib/`, the dependencies, the workflows, the hooks, the coverage baseline or `dist/`: the document and the implementation already agree, so only the guard was strengthened.
