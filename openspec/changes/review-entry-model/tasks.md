# Tasks

## 1. Entry configuration and resolution

- [x] 1.1 Add arbitrary kebab-case entries and the optional `pipeline` with `beforeApply`/`beforeArchive` defaults to `lib/review/config.js`, including validation errors for a bad entry name, an unknown pipeline key, an absent pipeline entry and a gate entry with the wrong object. Verify `npm run test:affected -- lib/review/config.js test/config.test.mjs` passes.
- [x] 1.2 Add a review-entry resolver in `lib/review/entry.js` that resolves an entry name against a parsed file or a locked policy, returns `{ name, profile, object, section }`, and exposes the configured entry names as one list. Verify new unit tests cover a `pr` entry and an unknown entry, including the unknown-entry error naming the configured entries.
- [x] 1.3 Write `pipeline` and the default entries in `lib/review/config.js` and `lib/init.js`, keeping `openspec_init`'s created/already-present report. Verify a temp-project test reads the written file, resolves `beforeApply`/`beforeArchive`, and checks the existing `reviewEnabled` cases.
- [x] 1.4 Update the configuration section of `docs/review.md` with the `profiles`/`reviews`/`pipeline` shape, the default pipeline and a non-default entry example. Verify `npm run test:affected -- test/review-doc.test.mjs` passes.

## 2. Policy schema version 3

- [x] 2.1 Lock every entry's `object` and parameters plus the pipeline and entry source names in `lib/review/policy.js`, raising `POLICY_SCHEMA_VERSION` to 3, keeping `configHash` over the new facts, and refusing a pipeline whose `beforeApply` is not a directory entry or `beforeArchive` is not a tree entry. Verify `npm run test:affected -- lib/review/policy.js test/policy.test.mjs` passes.
- [x] 2.2 Read a version 2 policy, a policy without `pipeline`, and a policy without an entry `object` with the `draft`/`apply` defaults and the default pipeline, without rewriting the file. Verify a legacy-policy read without `configPath` compares `policy.json` bytes and schema version before and after.
- [x] 2.3 The first start or resume with `configPath` SHALL supplement missing entry sections and the pipeline once, record schema version 3 and added-entry objects without a new `source` or a legacy-section object, then lock; a later `configPath` changes nothing. Verify an independent supplement test checks the added entry, pipeline, schema version, absent source and unchanged legacy section, and a second call leaves the bytes unchanged.
- [x] 2.4 Update the policy-locking and configuration-source sections of `docs/review.md` with the entry table, schema version 3, the legacy-read rule and the one-time `configPath` supplement. Verify `npm run test:affected -- test/review-doc.test.mjs` passes.

## 3. Record naming and compatibility

- [x] 3.1 Map an entry to its record file and round directory in `lib/review/record.js`: `draft` → `review.json`/`round-N`, `apply` → `apply-review.json`/`apply-round-N`, otherwise `<entry>-review.json`/`<entry>-round-N`; reject an unsafe entry segment. Verify unit tests cover all three mappings.
- [x] 3.2 Route report, round, revision, waiver and card reads through the entry-aware naming, keeping the legacy `draft`/`apply` paths byte-for-byte. Verify `npm run test:affected -- lib/review/record.js test/review-unit.test.mjs test/review-store-root.test.mjs` passes.
- [x] 3.3 Read an existing `review.json` or `apply-review.json` under its old name for a legacy policy and do not copy it to a new name. Verify a legacy-record test asserts the old path is read and no new file is created.
- [x] 3.4 Update the record-layout section of `docs/review.md` with the per-entry names and the legacy compatibility rule. Verify `npm run test:affected -- test/review-doc.test.mjs` passes.

## 4. Entry-driven review flow

- [ ] 4.1 Make `openspec_review` accept any locked entry through its optional `review` parameter (default `draft`, required for `dispose` and a finding `waive`), change the input and output schemas from a `draft`/`apply` enum to a plain string, resolve a missing policy from the project file on the first call, refuse an unknown entry before any record read, and update the tool and parameter descriptions. Verify `npm run test:affected -- lib/tools/review.js test/review-draft.test.mjs test/review-apply.test.mjs` passes.
- [ ] 4.2 Make `openspec_reviewer` accept the same entry names for `read`, `submit` and `status`, change its `review` schema from an enum to a plain string, update its descriptions, and carry the entry name through briefs, next actions and wake messages. Verify `npm run test:affected -- lib/review/reviewer-tool.js lib/review/wakeup.js test/review-reviewer.test.mjs test/review-wakeup.test.mjs` passes.
- [ ] 4.3 Dispatch the directory and tree flows by the locked entry `object`, keep the existing report, finding, revision and waiver contracts, and make a `pr` tree entry use the tree flow. Generalize artifact validation, the requirement-length gate, the execution preflight and the stale-round watch to any directory entry rather than a hardcoded `draft`. Verify a `pr` integration test starts, reports, and disposes without touching the draft or apply records, and a directory entry with another name runs the same checks.
- [ ] 4.4 Make disposition actions name a configured entry and list the configured entries on a missing or unknown `review`. Verify `npm run test:affected -- lib/tools/review.js test/review-unit.test.mjs` passes.
- [ ] 4.5 Update the entry, tool and reviewer sections of `docs/review.md` with the entry table, object-selected flow and the `review` default. Verify `npm run test:affected -- test/review-doc.test.mjs` passes.

## 5. Pipeline gates and status

- [ ] 5.1 Gate `openspec_apply_next` on `pipeline.beforeApply`, naming that entry when it is not ready; let a disabled or absent entry proceed. Verify `npm run test:affected -- lib/tools/apply.js test/review-draft.test.mjs test/apply-worktree.test.mjs` passes.
- [ ] 5.2 Gate `openspec_archive`, and the land that archives, on `pipeline.beforeArchive`, naming that entry when it is not ready; let a disabled, absent or unavailable entry proceed. Make `lib/worktree/land.js` read the `beforeArchive` record, record `beforeArchiveEntry`, `applyReviewId` and `reviewRecordHash` in the manifest (nulls without a review), and keep a manifest without `beforeArchiveEntry` reading as `apply`. Verify `npm run test:affected -- lib/tools/write.js lib/worktree/land.js test/review-apply.test.mjs test/worktree-land.test.mjs` passes, including a `beforeArchive: "pr"` land test and a behind-main `beforeArchive: "pr"` test that writes no `rebaseReview` and names `openspec_review action=resume review=pr` before retrying land.
- [ ] 5.3 Make status and next actions carry the entry name for start, resume, dispose, wait and self-report, including the frozen `beforeApply` case. Verify `npm run test:affected -- lib/review/readiness.js lib/tools/review.js test/review-status-mode.test.mjs` passes.
- [ ] 5.4 Update the gates and status sections of `docs/review.md` with the pipeline roles and the disabled/unavailable rule. Verify `npm run test:affected -- test/review-doc.test.mjs` passes.

## 6. Cards, client and configuration page

- [ ] 6.1 Use the entry name as the card `kind`, select `apply-review.json` for `apply`, `review.json` for `draft` and `<entry>-review.json` otherwise, and cache the record lookup per entry. Verify `npm run test:affected -- lib/review/cards.js test/review-cards.test.mjs test/review-cards-endpoint.test.mjs` passes.
- [ ] 6.2 Render the entry name in the collapsed summary, keep a missing value as `draft`, and make the client accept a `pr` kind without a code branch per known entry. Verify `npm run test:affected -- client.js test/review-cards-flow.test.mjs test/review-client.test.mjs` passes.
- [ ] 6.3 Show the entries and pipeline on the read-only configuration page and keep the page's no-save behavior. Verify `npm run test:affected -- lib/review/settings.js test/review-settings.test.mjs` passes.
- [ ] 6.4 Update the card section of `docs/review.md` with the entry kind, the raw-name rendering and the record-selection rule. Verify `npm run test:affected -- test/review-doc.test.mjs` passes.

## 7. Defaults, repository configuration and documentation

- [ ] 7.1 Add the `pr-tree` profile (`object: "tree"`, enabled, one reviewer, 15 minutes, inherit) and `reviews.pr` to this repository's `openspec/reviews.json`, leaving `pipeline` as `draft`/`apply`. Verify a `test/config.test.mjs` case reads this repository's file, resolves `pr`, and `npm run test:affected -- test/config.test.mjs` passes.
- [ ] 7.2 Update `README.md` with the entry table, pipeline, per-entry record names and the `review` parameter, and link `docs/review.md`. Verify `npm run test:affected -- test/review-doc.test.mjs` passes.
- [ ] 7.3 Update the shipped skills and `lib/policy.js` text where they name draft/apply review steps so they name the configured entry or the pipeline role. Verify `npm run test:affected -- test/skills.test.mjs test/skill.test.mjs` passes.
- [ ] 7.4 Run `openspec validate --strict` for this change and verify it reports no issues.

## 8. Integration verification

- [ ] 8.1 Run `npm run verify` on Node 24 and confirm the test summary and coverage verdict pass.
- [ ] 8.2 Run `npm run test:lab -- --mock-only` and confirm the offline flow still completes.
- [ ] 8.3 Read a change locked with a version 2 policy and a change locked with a version 3 policy through status, confirm the legacy one is unchanged and the new one reports its entries and pipeline.
- [ ] 8.4 Confirm no file under `scripts/pr-review-*.mjs` changed in this change.

## Workflow follow-up

- Start the apply review with `openspec_review action=start review=apply` after the implementation is committed, and submit or wait according to the locked reviewer count; resume until it is ready.
- Archive with `openspec_archive` only after the apply review is ready and the user asks.
