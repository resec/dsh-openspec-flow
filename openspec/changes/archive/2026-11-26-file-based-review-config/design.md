# Design

## Context

See `proposal.md` for motivation. The constraints that shape the approach:

- The plugin is plain ESM with Node built-ins only (`project-invariants`, "Runtime imports stay built-in"). No YAML parser and no new dependency.
- Review parameters today flow from the row config through `normalizeReviews` (`lib/review/config.js`) into `buildPolicy` (`lib/review/policy.js`), which locks them into `policy.json`. Tool registration reads `settings.reviews` at plugin `apply` time (`lib/tools/index.js`), where no project is known.
- A change's policy lives under `<git common dir>/openspec-flow/review/<store>#<change>/policy.json`, or `openspec/.review/...` without git.
- The plugin never parses `.openspec.yaml`; only the OpenSpec CLI writes it.

## Goals / Non-Goals

Goals: one project file owns every review parameter; policy locking snapshots the file; the page reports instead of edits; the PR loop can review with the baseline file.

Non-Goals: change-level or PR-level configuration files (later phase); YAML support; relock or drift detection; review rule text in the file (a reserved field only).

## Decisions

### The file is one JSON document with profiles and entries

`openspec/reviews.json` carries `profiles` and `reviews`. Each profile declares `object` plus the review parameters; `reviews.draft` names a directory profile and `reviews.apply` a tree profile. Alternatives considered: one file per entry (cannot share one tree profile between the apply entry and a later flow) and a directory layout keyed by object type (cannot express two entries that use different parameters). A single file also lets the whole configuration be validated in one pass and committed as one reviewable artifact.

### A dedicated reader validates with Node built-ins

A new module `lib/review/file.js` exports `readReviewConfig(projectRoot, options)` returning `{ ok: false, issues }` or `{ ok: true, value, source }`, where `source` carries the path relative to the project root when the file is inside it, the absolute path otherwise, the file sha256 and both profile names. The reader reuses the section normalizer from `lib/review/config.js` for parameter bounds and the reviewer model shape, so the two layers cannot drift. It reads synchronously on every call and keeps no cache: the file is small and the locking call is rare.

### Policy schema 2 adds the source snapshot

`buildPolicy` takes the parsed configuration instead of settings and writes `schemaVersion: 2`, `source`, and the resolved `reviews.draft`/`reviews.apply`. A v1 policy is never rewritten to add the `source` field, though the two migration helpers below may add a missing section or model. `ensurePolicy` gains the parsed configuration and the effective config path; an existing policy returns before any file read. The two v1 migration helpers, `ensureApplyPolicy` and `ensureReviewerModel`, take the same parsed configuration instead of the row settings, so a legacy draft-only policy gains the file's apply profile and a model-less policy gains the profile's model; a v2 policy never triggers them. A `configPath` supplied on a call that fills a missing section SHALL be the file parsed for that fill, so a pull request cannot lock its apply review from the checkout's own file.

### The row config keeps one switch and a legacy flag

`validateConfig` accepts `reviewEnabled` (default true) and no longer carries `reviews` parameters. It still accepts a `reviews` section, ignores it and returns `legacyReviews: true` in the validated value so `apply` can report the migration once. The flag never reaches the profile: the page has no save path, and no code writes the row config. An alternative of rejecting the row at load time was rejected because it makes the whole plugin row unavailable.

### Gates read only the locked policy

`assertDraftReviewReady` and `assertApplyReviewReady` drop their `settings.reviews` checks and read the policy alone, except that both pass while `reviewEnabled` is false: a change locked under the switch must stay applicable and archivable after the deployment turns reviews off, and the tool that would satisfy its gates is no longer registered. `openspec_new_change` skips policy locking in that state, so a project without the file can still create changes.

### The page reports, the file is the editor

The review settings channel keeps its read route and drops its update route. The page keeps its `plugins.row.config` registration as a read-only view: the read returns the global switch, the legacy flag, and per project its git availability, parsed configuration or schema error, and locked policies. The client renders this as a read-only view; no form state, no save button, no configuration editor call.

### init writes a default file and reports it

`openspec_init` checks `openspec/reviews.json` after the project structure exists. It writes the default document when absent, leaves an existing file untouched, and returns `reviewConfig: "created" | "exists"`. The default names `standard-directory` for draft and `standard-tree` for apply, both enabled with reviewers 0, a 15-minute wait and an inherited model. The repository's own file overrides the reviewer count to one, because the pull-request loop requires an independent reviewer on the apply entry.

### The PR loop supplies the baseline file

`scripts/pr-review-watch.mjs prepare` copies the main worktree's `openspec/reviews.json` to `<main worktree>/.cache/pr-review/reviews.json` and the review instruction passes that absolute path as `configPath`. The plugin resolves a relative path against the project root and records an absolute path as given, so a source outside the root keeps its absolute form. The PR checkout's own file is never read for locking. The repository itself gains `openspec/reviews.json` so its own changes can still be created after the switch.

## Risks / Trade-offs

- An existing project without the file fails change creation and review start → the error names the path and the `openspec_init` step; the migration plan lists the one-time action.
- The `legacyReviews` flag assumes nothing serializes the validated row value → no save path exists and the test asserts the profile patch is unchanged after a read.
- The PR baseline copy lives under the cache directory that cleanup may delete → `prepare` rewrites it on every run and the review instruction runs before the start.
- Mixed v1 and v2 policies → reads tolerate both, writes only for a new lock.
- `reviewEnabled` is a registration-time switch, so a profile cannot disable one review kind at load time → the project file's `enabled` narrows each entry after registration.

## Migration Plan

1. Install the new plugin version; the plugin loads with any existing row config.
2. In each project run `openspec_init` or write `openspec/reviews.json`, and commit it.
3. Remove the profile's `reviews` section; the plugin ignores it and reports the move.
4. Existing locked changes keep their policy; changes created afterwards use the file.

Rollback: restore the profile `reviews` section and the previous plugin version; the project file stays in the repository and is ignored by the old version.

## Open Questions

None.
