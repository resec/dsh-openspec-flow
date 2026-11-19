# Tasks

## 1. Shared root resolution

- [ ] 1.1 Add the git common-directory resolver, primary/legacy review-root helpers and the stable nested-root record suffix; cover a top-level git project, a linked worktree, two nested roots with the same change name and a non-git directory in a new `test/review-store-root.test.mjs`.
- [ ] 1.2 Make `reviewDirectory` use the primary root and add one-time legacy copy with a migration marker, per-record migration lock, temporary copy and rename, skipping `.lock`; verify copy, marker-suppressed recopy after removal, no-copy-when-primary-exists, and no partial record survive in the same test file.
- [ ] 1.3 Skip the `openspec/.gitignore` write and `git check-ignore` gate when the record resolves under the git common directory, while keeping the legacy behavior; verify a git review start writes no ignore file and a legacy start still runs the gate.
- [ ] 1.4 Keep the legacy root for non-git projects and keep its `openspec/.gitignore` behavior; verify the new test file covers the non-git path and the existing ignore tests still pass.

## 2. Record consumers

- [ ] 2.1 Update the settings policy listing to scan the primary root, then legacy keys without a primary record or marker, resolving each through the resolver; verify a legacy policy is listed once and a removed shared record is not re-listed.
- [ ] 2.2 Update the client card reader to scan the primary root, then legacy keys without a marker, without copying or migrating a record; verify a legacy card is returned and bound to the turn with the watermark written, and is suppressed after a migrated record is removed.
- [ ] 2.3 Add the same-root fixture helper and update the hard-coded `openspec/.review` assertions in `test/review-fixtures.mjs` and these seven git-fixture files: `review-apply`, `review-status-mode`, `review-seal`, `review-serial`, `review-wait`, `review-reviewer` and `review-draft`; run those files directly because the affected-test selector stops at `index.js`.
- [ ] 2.4 Run `npm run test:affected -- lib/review/store.js lib/review/cards.js lib/review/settings.js` after the batch.

## 3. Documentation

- [ ] 3.1 Update `docs/review.md` record-layout, copy/marker, nested-root and legacy-card notes, `README.md` record-root sentences, and `CONTRIBUTING.md` record-root statements; verify the documentation test finds the shared root, legacy root, marker, nested suffix and the shared-root ignore skip.
- [ ] 3.2 Verify `openspec_inspect` with `action: "validate"` and `strict: true` passes for the change.

## 4. Integration

- [ ] 4.1 Run `npm test` and `npm run verify` on Node 24; report the test summary and coverage verdict.
- [ ] 4.2 Verify `npm run openspec:check` passes over active changes and main specs.

## Workflow follow-up

- Apply review after committing the implementation.
- Archive after the apply review is ready, then commit the archive and push `origin/main`.
