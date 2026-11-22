# Tasks

## 1. Decouple the fixture from the host

- [x] 1.1 Point the bare remote's `HEAD` at `refs/heads/trunk` after `git init --bare`.
- [x] 1.2 Confirm the missing-main scenario fails before the change and passes after it.

## 2. Verify

- [x] 2.1 Run `node --test --test-name-pattern="remote ahead" test/push-landed.test.mjs`.
- [x] 2.2 Run `npm test`, `openspec validate fix-push-landed-remote-head --strict`, `npm run openspec:check` and `npm run layout:check`.
