# Tasks

## 1. Resolve the record from the change root

- [x] 1.1 Load the change context in `retryReview` and locate the record with `context.rootPath`; pass the settings through the dispatch.
- [x] 1.2 Do the same in `replaceReview`, and start the replacement reviewer at the resolved root: a reviewer started in the session directory resolves the suffixed record path, misses the brief and cannot submit.
- [x] 1.3 Make `waiveReviewer` async, resolve the context, and await it at the dispatch.

## 2. Guard the behaviour

- [x] 2.1 Add a test that starts a draft review at the root, moves the session to `packages/demo`, then runs `retry`, `replace` and `waive-reviewer`, reads the record at the root, and asserts the replacement reviewer's activation working directory is the root.
- [x] 2.2 Confirm the test fails against the previous resolution.

## 3. Verify

- [x] 3.1 Run `openspec validate fix-review-action-root --strict`.
- [x] 3.2 Run `npm run verify`, `npm run openspec:check` and `npm run layout:check`.
- [x] 3.3 Run `npm run test:lab -- --mock-only`.
