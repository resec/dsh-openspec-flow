# Proposal

## Why

`parseUnifiedDiff` treated any line starting with `+++ ` as a file header. An added source line whose text starts with `++ ` renders as `+++ ` in the diff, so the parser switched to a phantom file and recorded the following hunks of the real file against that phantom path. Those added lines then vanished from the new-code check, which silently lowered the set of lines the gate inspects.

## What Changes

- Only accept a `+++ ` line as a file header when it follows a `diff --git` line, so content lines can no longer become a file boundary.
- Add a one-file case whose added lines include `+++ …`, and a multi-file case that asserts each file keeps its own lines.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `coverage-gate` new-code requirement already says the gate checks the lines added or modified since the merge base; the parser dropped some of them, so this change sets `skip_specs: true`.

## Impact

- `scripts/coverage-gate.mjs`: the file-header branch of `parseUnifiedDiff`.
- `test/coverage-gate.test.mjs`: two diff-parsing tests.
- No dependency, workflow, hook, baseline or `dist/` change.
