# Tasks

## 1. Review configuration reader

- [x] 1.1 Create `lib/review/file.js` with `readReviewConfig(projectRoot, options)`: resolve `configPath` (relative to the project root, absolute as given), read `openspec/reviews.json` synchronously, return `{ ok: false, issues }` or `{ ok: true, value, source }` with `source.path` (project-relative when inside the root, otherwise absolute), `source.sha256` and both profile names, and require every profile parameter instead of filling defaults. Verify with `node --test test/review-file.test.mjs` after 1.3.
- [x] 1.2 Move the parameter and reviewer-model normalization that the file needs into reusable exports in `lib/review/config.js`: bounds (`enabled`, `reviewers`, `waitMinutes`, `reviewerModel`) and the profile/entry shape rules, keeping the row-config independent. Verify `node --test test/review-unit.test.mjs` still passes.
- [x] 1.3 Create `test/review-file.test.mjs` covering a valid file, a missing file, unparsable JSON, `reviewers: 2`, `maxRounds`, `waitMinutes: 0`, a profile missing a parameter, a draft entry naming a tree profile, a missing entry, a missing profile, an unknown entry such as `pr`, an unknown profile key, an absolute `configPath` outside the project root, and an inherited model. Verify with `node --test test/review-file.test.mjs`.

## 2. Row config and tool registration

- [x] 2.1 Change `lib/config.js`: accept `reviewEnabled` (default true), stop validating and carrying `reviews` parameters, and return `legacyReviews: true` in the validated value when the input still carries a `reviews` section. Verify `node --test test/config.test.mjs`.
- [x] 2.2 Change `lib/tools/index.js` so `openspec_review` registers while `settings.reviewEnabled` is true and never otherwise. Verify `npm run test:affected -- lib/tools/index.js`.
- [x] 2.3 Update `test/config.test.mjs`: a `reviewEnabled` boundary case, a legacy `reviews` section accepted with the flag, and the switch default. Verify `node --test test/config.test.mjs`.

## 3. Policy locking from the project file

- [x] 3.1 Change `lib/review/policy.js`: `buildPolicy` takes the parsed configuration and writes `schemaVersion: 2` with `source { path, sha256, profiles }`; `ensurePolicy` takes the parsed configuration and the effective config path; `ensureApplyPolicy` and `ensureReviewerModel` take the parsed configuration instead of row settings; reading a v1 policy returns it unchanged and never rewrites it. Verify `node --test test/review-unit.test.mjs`.
- [x] 3.2 Change `lib/tools/write.js`: `openspec_new_change` reads the project file (or skips locking when `reviewEnabled` is false), fails with the file path and field on an invalid file, and returns a `configNotice` when the row config carries a legacy `reviews` section. Verify `npm run test:affected -- lib/tools/write.js`.
- [x] 3.3 Change `lib/tools/review.js`: the first `start` reads the project file or the `configPath` argument before locking, `assertDraftReviewReady` and `assertApplyReviewReady` read only the locked policy and pass while `reviewEnabled` is false, and the first locking call returns the legacy `configNotice`. Verify `npm run test:affected -- lib/tools/review.js`.
- [x] 3.4 Add regression cases to `test/review-unit.test.mjs` for the v2 policy, the source snapshot, a v1 policy kept unchanged, a changed file hash not failing a resume, a legacy draft-only policy migrated from the file, a draft-only policy migrated from a supplied `configPath`, a model-less policy backfilled from the file, and both gates passing while the switch is false. Verify `node --test test/review-unit.test.mjs`.
- [x] 3.5 Add cases to `test/review-model.test.mjs` for an inherit model resolved from the file and a policy without a source still reading its locked model. Verify `node --test test/review-model.test.mjs`.

## 4. Read-only configuration page

- [x] 4.1 Change `lib/review/settings.js`: the read route returns `reviewEnabled`, the legacy flag, and per project the git availability, the parsed configuration or its schema error, and the locked policies; remove the settings update route. Verify `npm run test:affected -- lib/review/settings.js`.
- [x] 4.2 Change `client.js` to render the read-only view: the global switch, the per-project profiles and entries, schema errors and locked policies, with no form state and no save call. Verify `npm run test:affected -- client.js`.
- [x] 4.3 Update `test/review-settings.test.mjs` and `test/review-client.test.mjs` for the read-only shape, the removed update route and the rendered fields. Verify `node --test test/review-settings.test.mjs test/review-client.test.mjs`.

## 5. init writes the default file

- [x] 5.1 Change `lib/init.js` to write the default `openspec/reviews.json` when absent, leave an existing file untouched, and return `reviewConfig: "created" | "exists"`; verify the tool result with `npm run test:affected -- lib/init.js`.
- [x] 5.2 Add cases to `test/integration.test.mjs` and `test/admin.test.mjs` for a created file, an existing file and the disabled switch. Verify `node --test test/integration.test.mjs test/admin.test.mjs`.

## 6. Pull-request baseline configuration

- [x] 6.1 Change `scripts/pr-review-watch.mjs` so `prepare` copies the main worktree's `openspec/reviews.json` to `.cache/pr-review/reviews.json`, refuses when the baseline file is absent, and the review instruction passes that path as `configPath`. Verify `node --test test/pr-review-watch.test.mjs`.
- [x] 6.2 Update `docs/pr-review.md` and `AGENTS.md`: the prerequisite becomes the baseline `main` file with one reviewer on the apply entry, and the recovery names the baseline file instead of the profile. Verify the guardrail text check with `npm run test:affected -- docs/pr-review.md AGENTS.md`.
- [x] 6.3 Add cases to `test/pr-review-watch.test.mjs` for the copied baseline, a missing baseline, a PR head with a different file, and a draft-only policy started with the baseline path. Verify `node --test test/pr-review-watch.test.mjs`.

## 7. Project files and documentation

- [x] 7.1 Create the repository's own `openspec/reviews.json` with a directory profile for draft and a tree profile for apply, one reviewer each (overriding the default of 0, because the PR loop needs an independent reviewer), a 15-minute wait and an inherited model, and commit it. Verify `openspec validate --strict` accepts the project and a new change locks from the file.
- [x] 7.2 Rewrite the configuration section of `docs/review.md`: the file layout and example, the two entry names and object types, the fail-closed behavior, the source snapshot and no relock, the `reviewEnabled` switch, and the read-only page. Verify `node --test test/review-doc.test.mjs`.
- [x] 7.3 Update the README review section: the project review file, `openspec_init` writing the default, the fail-closed read, the `configPath` and disabled-switch exceptions, that `reviewEnabled` is edited in the profile patch, and a link to `docs/review.md`. Verify `npm run test:affected -- README.md`.
- [x] 7.4 Update `test/review-doc.test.mjs` so its default table and key checks read the `openspec_init` default constant (not the repository's own file, which overrides the reviewer count) instead of the row config defaults. Verify `node --test test/review-doc.test.mjs`.

## 8. Integration checks

- [x] 8.1 Run `npm test` on Node 24 and fix every failure. Verify the summary reports zero failing tests.
- [x] 8.2 Run `npm run verify` and confirm the coverage gate passes. Verify the command exits zero.
- [x] 8.3 Run `openspec_inspect` with `action: "validate"` and `strict: true` for the change and confirm no findings.
- [x] 8.4 Manually exercise a scratch project: create a change with the file absent (fails with the path), add the default file via `openspec_init`, create a change (locks `schemaVersion: 2` with the source), and start a draft review with a profile that has `reviewers: 0`.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
