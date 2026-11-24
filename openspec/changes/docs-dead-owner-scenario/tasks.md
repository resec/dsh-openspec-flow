# Tasks

## 1. Correct the scenario

- [x] 1.1 Rewrite the THEN of "A dead owner uses recover" so land reports `recover` and refuses, and the user recovers before retrying land.
- [x] 1.2 Keep the requirement title, description and the other three scenarios byte-identical to `openspec/specs/apply-worktree/spec.md`.
- [x] 1.3 Confirm `lib/worktree/land.js` throws the `recover` instruction and `test/worktree-land.test.mjs` asserts the refusal.

## 2. Verify

- [x] 2.1 Run `npx openspec validate docs-dead-owner-scenario --strict`.
- [x] 2.2 Run `npm run openspec:check`, `npm run check:requirement-length`, `npm run check:pr`.
