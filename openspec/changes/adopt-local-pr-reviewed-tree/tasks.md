# Tasks

## 1. Adoption command

- [x] 1.1 Add a landed-manifest lookup by change in `scripts/pr-local-shared.mjs`, selecting the manifest whose archive commit is `main`; verify the multiple-manifest and stale-manifest cases in `test/pr-local-land.test.mjs`.
- [x] 1.2 Implement `adoptLocal`, the `--tree` CLI option, command dispatch and help in `scripts/pr-local-land.mjs`; verify the worktree, landed-manifest and merged-pull-request adoption tests in `test/pr-local-land.test.mjs`, including that a manifest plus a corroborating worktree records the manifest feature head and a merged pull request plus a worktree records the merge commit.
- [x] 1.3 Cover adopt's dry run, every refusal (unpassed review, open finding, no source, pushed entry, other owner, mismatched merged tree, manifest on `main` naming another tree) and the unchanged phase; verify with `node --test test/pr-local-land.test.mjs`.

## 2. Failing-command guidance

- [x] 2.1 Name the adopt command in `verify`'s tree-mismatch refusal and plan adopt in `recover` before retarget when the merged tree has a passed review; verify the new verify and recover tests in `test/pr-local-land.test.mjs`.
- [x] 2.2 Make `finish` name adopt when a manifest for another tree is on `main`; verify the new finish test in `test/pr-local-land.test.mjs`.

## 3. Documentation

- [x] 3.1 Document the adopt command, dry run, validation sources and ordering in `docs/local-pr.md` and `AGENTS.md`; extend `test/local-pr-doc.test.mjs` and `test/contributor-docs.test.mjs`; verify with `node --test test/local-pr-doc.test.mjs test/contributor-docs.test.mjs`.

## 4. Verification

- [x] 4.1 Run `npm run test:affected` for the touched scripts and `npm run verify` on Node 24; confirm the full suite and coverage gate pass.
- [x] 4.2 Run `openspec_inspect` action=validate strict=true, `npm run check:requirement-length` and `npm run openspec:check`; confirm no findings.

## Workflow follow-up

- Draft review before apply.
- Commit the implementation, run the apply review, publish the pull request, merge, land, archive and push.
- Finish the local entry through `pr-local-land finish --phase pushed`.
