# Add the reviewer preset

## Why

Draft and apply review currently support only `reviewers: 0`, so the changer reviews its own work. The approved design calls for one independent read-only reviewer with a dedicated tool set, a separate `openspec_reviewer` tool and synchronous `wait`.

## What Changes

- Allow `reviewers: 1` for draft and apply review.
- Start one reviewer through `startActivation({ delivery: 'caller' })` with the `openspec-reviewer` preset.
- Add `openspec_reviewer` with `read`, `submit` and `status`; only the preset exposes it.
- Add `wait`, `retry`, `replace` and `waive-reviewer` to `openspec_review`.
- Mark the review record with the reviewer slot, child id, state and replacement metadata.
- Keep `reviewers: 0` self-review unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: independent reviewer activation, slot state, wait, retry, replace and waiver.
- `tool-surface`: `openspec_reviewer` and the `openspec-reviewer` preset.
- `flow-policy`: the rule states the independent reviewer mode.
- `skill-adaptation`: the workflow skills wait for a reviewer when `reviewers` is 1.

## Impact

- `lib/tools/review.js`: external activation and wait actions.
- `lib/review/submit.js` (new): shared report submission.
- `lib/review/reviewer-tool.js` (new): `openspec_reviewer`.
- `reviewer.js` (new subpath entry) and `package.json` export.
- `cordis.patch.yml`: preset row.
- `lib/review/config.js`: reviewers 0 or 1.
- Tests: fake subagents, preset tool set, wait/retry/replace/waive.
