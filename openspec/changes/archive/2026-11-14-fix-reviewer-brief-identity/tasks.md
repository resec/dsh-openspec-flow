# Tasks

## 1. Neutral brief opening

- [x] 1.1 Replace the whole sentence `You wrote this planning material as the changer; review it adversarially.` in `lib/review/brief.js` with `Review this planning material adversarially.`, keeping the other three opening sentences (`You are reviewing a change before implementation starts.`, `Do not assume the proposal is correct.`, `Read the artifacts yourself; the hashes below bind the version you are reviewing.`) unchanged; verify `grep -rniE "you (wrote|drafted|planned)|as the changer" lib skills docs` and `grep -n "review it adversarially" lib/review/brief.js` both return no match.
- [x] 1.2 Extend the self-review and independent-review assertions in `test/review.test.mjs` so `started.brief` and the reviewer `read.brief` assert the opening paragraph equals `You are reviewing a change before implementation starts. Review this planning material adversarially. Do not assume the proposal is correct. Read the artifacts yourself; the hashes below bind the version you are reviewing.` and satisfies `assert.doesNotMatch(brief, /you (wrote|drafted|planned)|as the changer/i)`; verify `node --test test/review.test.mjs` passes on Node 24.

## 2. Configuration comment

- [x] 2.1 Correct the `reviewers` comment in `lib/review/config.js` to state the 0 or 1 range; verify the comment agrees with the `integerSetting(..., 0, 1, ...)` bound on the same path.

## 3. Documentation

- [x] 3.1 Add "draft brief 的开头在两种模式下相同：要求对抗性审阅，不声明读者是作者" to the reviewer-mode section of `docs/review.md`, assert `/draft brief 的开头在两种模式下相同/` in the "the document covers both review kinds and both reviewer modes" test in `test/review-doc.test.mjs`, and verify `node --test test/review-doc.test.mjs` passes.

## 4. Integration checks

- [x] 4.1 Run `openspec_inspect` with `action: "validate"`, `change: "fix-reviewer-brief-identity"` and `strict: true`; verify it passes.
- [x] 4.2 Run `npm test` with Node 24 on `PATH`; verify it passes.
- [x] 4.3 Run `npm run coverage:check` with Node 24 on `PATH`; verify it passes.

## Workflow follow-up

- Commit the implementation and run the apply review; fix every blocker.
- Archive only when the user asks, after the apply review is ready.
- After archive, commit the archive, documentation and merged specs, then push to `origin/main`.
