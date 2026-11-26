# File-based review configuration

## Why

Review parameters currently live in the plugin's row config in the profile patch, so they cannot travel with a repository, cannot differ between projects, and cannot be reviewed in the same pull request as the code they govern. A project that keeps its OpenSpec workflow in version control has no way to state which review policy its changes receive.

## What Changes

- A project-level `openspec/reviews.json` becomes the project's source of review parameters; the first lock may name another file through `configPath`. The plugin row config no longer carries `reviews`; its `reviews` section is accepted but ignored, and the first review read reports that it must move to the project file.
- The file carries named profiles and two entries: `profiles.<name>` declares `object` (`directory` or `tree`) plus `enabled`, `reviewers`, `waitMinutes` and `reviewerModel`; `reviews.draft` and `reviews.apply` name the profile each review kind uses. A profile whose `object` does not match its entry point is refused.
- **BREAKING**: `openspec/reviews.json` is mandatory for review. A missing, unreadable, unparsable or invalid file fails change creation and review start instead of falling back to defaults, unless `reviewEnabled` is false or the call supplies `configPath`. `openspec_init` writes a default file when it is absent and leaves an existing one untouched; the default profiles carry reviewers 0 and an inherited model.
- Policy locking reads the project file. `policy.json` records the source path, its sha256 and the resolved profile names, and keeps the resolved parameters. A later file edit affects only changes created afterwards; there is no drift check and no relock entry.
- The plugin row config keeps one review switch, `reviewEnabled` (default true). While it is false the plugin registers no `openspec_review`, `openspec_new_change` skips policy locking, no project file is read for locking or gating (the read-only page may still parse it for display), and the draft and apply gates pass so a change locked under the switch stays applicable and archivable.
- `openspec_review` accepts an optional `configPath` for the first locking call, so a repository-side flow can review with a baseline project file instead of the checkout's copy. After a change is locked the argument is ignored.
- The configuration page becomes read-only: it lists each project's profiles, entries, schema errors and locked change policies, and no longer edits review settings.
- PO review is not a plugin review kind: the plugin keeps the two object types and the draft and apply entry points, and the repository's pull-request flow supplies its own baseline file through `configPath`.

## Capabilities

### New Capabilities

None. The configuration surface stays inside the existing `review-configuration` capability.

### Modified Capabilities

- `review-configuration`: the page stops editing settings; the profile file, its schema and the runtime `reviewEnabled` switch replace the row config parameters.
- `change-review`: policy locking reads the project file, records the source snapshot and stops validating the row config; a locked policy keeps the file's parameters.
- `tool-surface`: `openspec_review` gains `configPath`; tool registration follows `reviewEnabled`; `openspec_init` reports the review-config state it writes or finds.
- `review-documentation`: the review document and the README describe the file, the profiles, the mandatory failure and the read-only page.
- `pr-review-pipeline`: the pull-request loop uses the baseline main configuration through `configPath` instead of requiring `reviews.apply` in the profile.

## Impact

- Code: `lib/config.js`, `lib/review/file.js` (new), `lib/review/config.js`, `lib/review/policy.js`, `lib/review/settings.js`, `lib/tools/index.js`, `lib/tools/write.js`, `lib/tools/review.js`, `lib/init.js`, `client.js`, `scripts/pr-review-watch.mjs`.
- Documents: `docs/review.md`, `docs/pr-review.md`, `README.md`, `AGENTS.md`.
- Tests: `test/config.test.mjs`, `test/review-file.test.mjs` (new), `test/review-unit.test.mjs`, `test/review-doc.test.mjs`, `test/review-settings.test.mjs`, `test/review-client.test.mjs`, `test/review-model.test.mjs`, `test/integration.test.mjs`, `test/admin.test.mjs`, `test/pr-review-watch.test.mjs`.
- Runtime: no new dependency; the file is parsed with Node built-ins. The plugin keeps importing only Node built-ins and relative modules.
