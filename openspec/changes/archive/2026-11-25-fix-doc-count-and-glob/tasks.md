# Tasks

## 1. Correct the documents

- [x] 1.1 State ten tools with seven in the core block in `index.js`.
- [x] 1.2 Use the recursive scenario glob in both `docs/lab.md` sentences.

## 2. Verify

- [x] 2.1 Run `openspec validate fix-doc-count-and-glob --strict`.
- [x] 2.2 Run `npm test`, `npm run openspec:check` and `npm run layout:check`.
- [x] 2.3 Run `npm run verify` on Node 24: suite 1202/1203 with the one pre-existing `push-landed` fixture failure (git 2.50 refuses to delete the current branch of the bare fixture; fixed by a separate change), coverage 98.58% lines / 93.56% branches / 99.19% functions, and the `verify` check on the branch is green in CI.
