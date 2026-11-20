# Tasks

## 1. Gate and parser

- [x] 1.1 Move `statusLinePath` into `lib/status-paths.js` together with a sibling that returns both paths of a rename, re-export `statusLinePath` from `lib/review/store.js`, and verify `node --test test/review-lock.test.mjs` passes with its existing rename and quoted-name assertions unchanged.
- [x] 1.2 Make `dirtyPaths` in `lib/bundle.js` return every path a status line touches through the shared parser, and verify new cases in `test/bundle.test.mjs` cover a plain modification, a `R  old -> new` rename returning both `old` and `new`, and a quoted path.
- [x] 1.3 Implement `splitDirtyPaths` in `lib/status-paths.js`, owning the `openspec/` prefix rule and the backslash normalization, re-export it from `lib/bundle.js`, and verify `test/bundle.test.mjs` covers `openspec/changes/x/tasks.md` as ignored, `openspec\changes\x\tasks.md` as ignored, `lib/a.js` as blocking and `packages\x\openspec\changes\y\tasks.md` as blocking.
- [x] 1.4 Apply the classifier in `lib/pack.js`: print blocking paths as errors, print ignored paths on their own informational line, keep exit code 1 only when a blocker exists, rewrite `USAGE_LINES` to state that uncommitted changes outside `openspec/` are refused, and verify `test/pack.test.mjs` covers openspec-only dirt (packs, metadata `revision` at `HEAD`, `dirty` false, no `openspec/` path in the tarball, and the ignored paths printed on the informational line rather than as errors), a published file renamed under `openspec/` (nothing packed, exit code 1) and the new help wording instead of comparing the constant with itself.

## 2. Documentation

- [x] 2.1 Rewrite the working-tree prerequisite in `docs/installing-bundles.md` so it states that only published content must be committed and that `openspec/` dirt is reported as ignored, and verify the rest of the page still matches the entrypoint's output and flags.
- [x] 2.2 Update the Bundle packaging paragraph in `AGENTS.md` so it says the entrypoint refuses uncommitted changes outside `openspec/`, and verify that paragraph names only those uncommitted changes as refused while the coverage-stamp sentences about a dirty tree stay unchanged.
- [x] 2.3 Restate the same prerequisite in `README.md` (the install text that ships in the tarball) and add `lib/status-paths.js` to its `## 文件` layout beside `lib/bundle.js` and `lib/pack.js`, then verify the pack prerequisite names only uncommitted changes outside `openspec/` while the coverage-stamp statements stay unchanged.

## 3. Integration checks

- [ ] 3.1 Run `npm run test:affected -- lib/pack.js lib/bundle.js lib/status-paths.js lib/review/store.js` and verify the selected test files pass.
- [ ] 3.2 Run `npm run verify` on Node 24 and verify both the test summary and the coverage verdict pass, including the new-code thresholds for `lib/status-paths.js`.
- [ ] 3.3 Run `openspec_inspect` with `action: "validate"` and `strict: true` and verify it reports no findings.

## Workflow follow-up

- Commit the implementation, then start the apply review with `openspec_review` before archive.
- Archive the change after its review requirements are satisfied, and repack the bundle only when the installed copy must run the new logic.
