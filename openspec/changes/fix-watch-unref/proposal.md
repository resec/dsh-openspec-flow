# Proposal

## Why

`lib/review/watch.js` arms an `fs.watch` handle and unrefs only the debounce timer. A non-Host process that arms a draft round watch therefore keeps a referenced handle and stays alive until a report, an abandon or an unload, so a caller that only wanted the advisory notice never returns on its own. A script that arms the watch and ends is still running after several seconds; with the handle unref'd it exits once its other work is done.

## What Changes

- Unref the watcher handle when the watch arms; `stop` still closes it on a report, an abandon, an error or an unload.
- State the handle lifecycle in the `change-review` capability and guard it with a child-process test that fails when the unref is removed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: adds a requirement that an armed draft round watch releases its file-watcher handle and debounce timer so the process can exit.

## Impact

- `lib/review/watch.js`: one call after the watcher is created.
- `test/review-watch.test.mjs`: a watcher assertion and a child-process exit test.
- No change to the notice rules, the record files, `lock.js`, `review.js`, dependencies, workflows, hooks, the coverage baseline or `dist/`.
