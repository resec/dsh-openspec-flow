# Tasks

## 1. Overlay tree and base resolution

- [x] 1.1 Add `overlaySealTree({ root, sealCommit, onto })` to `lib/worktree/seal.js`: a temporary index from `read-tree <onto>`, every path the seal commit changed written through `git ls-tree` plus `git update-index --index-info` (a path the seal removed written as a mode-0 line), `git write-tree`, and a self-check that every seal-changed path matches the seal's entry and that `git diff --name-only <onto> <overlay>` is a subset of the seal's changed paths; return `undefined` on any failure or mismatch. Verify `node --test test/review-base.test.mjs` covers a path containing a space, a path whose fork content already equals the seal, a path the seal removed, a nested path prefix and the failure return.
- [x] 1.2 Add `lib/review/base.js` with `resolveApplyBase({ root, baseline, explicitBase, draftBaseCommit, recordedBaseCommit, recordedBaseSource })`: an explicit base wins unchanged; a draft round moves to the fork only when the seal's parent is an ancestor of the fork and differs from it; an automatic no-draft base moves only when its recorded source is `merge-base` and it is an ancestor of the fork; an `explicit` recorded base and a non-ancestor base stay; a round whose fork cannot be resolved keeps the recorded base; the result carries `baseCommit`, `baseTreeSha`, `baseSource` and `rebasedFrom`. Verify `node --test test/review-base.test.mjs` covers explicit, unchanged, re-based draft, re-based automatic, explicit-recorded and unresolved cases with their sources.
- [x] 1.3 Wire the resolver into the apply base block of `lib/tools/review.js` for start, resume and extra rounds, write `baseSource` and the optional `rebasedFrom` on the record, and pass the source to the brief builder. Verify `node --test test/review-apply.test.mjs` covers a rebased round whose `diff.patch` lacks a main-only path and whose record moves from `baseSource: "seal"` to `"rebase"`.
- [x] 1.4 Cover the no-draft outcomes end to end: an automatic base re-bases to the fork, an `explicit` recorded base stays, and a non-ancestor base stays. Verify `node --test test/review-apply.test.mjs` covers all three outcomes, their sources, and a no-draft round whose brief names the fork and the `rebasedFrom` base.
- [x] 1.5 Refuse the round with an instruction to pass `base` when the overlay fails its self-check, leaving the record unchanged. Verify `node --test test/review-base.test.mjs test/review-apply.test.mjs` covers the refusal and the unchanged record.

## 2. Review output

- [x] 2.1 Add the `rebase` base-source sentence and the `rebasedFrom` line to `buildApplyBrief`, leaving the seal, explicit and merge-base text unchanged. Verify `node --test test/review-reviewer.test.mjs` asserts every source text and the new line.
- [x] 2.2 Add an integration case where main is merged into the branch, and retitle the existing rebase test so its no-`origin/main` case covers the unresolved fork while a new case covers the resolved fork. Verify `node --test test/review-apply.test.mjs test/review-reviewer.test.mjs` and `npm run test:affected -- lib/tools/review.js lib/review/base.js lib/review/brief.js lib/worktree/seal.js`.

## 3. Documentation

- [x] 3.1 Update `docs/review.md`: the seal/base paragraph, the rebase extra-round paragraph and the brief base-source paragraph, stating the re-base rule, the `rebase` source and `rebasedFrom`; update the base-source assertion in `test/review-doc.test.mjs` to require `rebase`. Verify `node --test test/review-doc.test.mjs` passes and the three paragraphs read back with the new terms.
- [x] 3.2 Update the step 6 clause of `AGENTS.md` so a resume after a rebase re-resolves the diff base and records the source. Verify `grep -n "re-resolves the diff base" AGENTS.md` finds the clause and `node --test test/review-doc.test.mjs` still passes.

## 4. Integration verification

- [x] 4.1 Run `openspec_inspect action="validate" change="fix-apply-review-rebased-base" strict=true` and confirm zero issues.
- [x] 4.2 Run `npm run verify` on Node 24 and confirm the test summary and coverage verdict pass; run `node scripts/check-requirement-length.mjs --change fix-apply-review-rebased-base`.

## Workflow follow-up

- Publish the pull request from the apply worktree, wait for green CI, merge with rebase, run verify and retarget, land and archive in the lifecycle, then publish the archive commit with `push-landed --push` and finish the local phase.
