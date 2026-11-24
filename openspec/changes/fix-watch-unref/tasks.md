# Tasks

## 1. Release the handle

- [x] 1.1 Unref the watcher handle when the watch arms, keeping `stop` as the single close path.

## 2. Guard the exit

- [x] 2.1 Assert the armed watcher is unref'd and that disarming still closes it.
- [x] 2.2 Add a child-process test: a process that arms a real watch exits within 1.5 seconds.

## 3. Verify

- [x] 3.1 Confirm both new tests fail when the `unref` call is stashed.
- [x] 3.2 Run `openspec validate fix-watch-unref --strict`, `node --test test/review-watch.test.mjs`, `npm run openspec:check` and `npm run verify`.
