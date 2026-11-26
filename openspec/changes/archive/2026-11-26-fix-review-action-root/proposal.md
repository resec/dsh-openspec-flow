# Proposal

## Why

`retry`, `replace` and `waive-reviewer` resolve the review record from the session working directory, while every other review action first resolves the change's OpenSpec root and uses `reviewDirectory(context.rootPath, ...)`. The record name carries a `@root-<hash>` suffix for a nested root, so a session below the root reads a different directory, fails to find the record, and leaves an empty record directory behind.

## What Changes

- Resolve the change context in `retry`, `replace` and `waive-reviewer` before locating the record, and use the resolved root.
- Make `waiveReviewer` asynchronous so it can run the same resolution; the dispatch already awaits.
- Add a test that moves the session to a subdirectory and exercises all three actions against the record written at the root.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The actions keep their contract; only the directory they resolve changes, so this change sets `skip_specs: true`.

## Impact

- `lib/tools/review.js`: three actions and their call sites.
- `test/review-reviewer.test.mjs`: one new test.
- No tool schema, dependency, workflow, hook, coverage-baseline or `dist/` change.
