# Design: review entry model

## Context

See [proposal.md](proposal.md) for the motivation and the capability split. The current configuration has two layers, `profiles` and `reviews`, but the reader binds `reviews.draft` to a `directory` profile and `reviews.apply` to a `tree` profile. The policy records only those two sections. `lib/review/record.js` derives the record file and round prefix from `kind`; the review tools, reviewer preset, cards, settings page and lifecycle gates branch on `draft`/`apply` in roughly 57 places. A pull-request review therefore has no place of its own: it either reuses the apply section or edits a copied configuration.

The constraints that shape the design:

- The policy is locked for a change's lifetime, so the flow and gate choice must be resolved at lock time, not on every call.
- Existing changes, policies, records and cards must keep working without a manual migration.
- The plugin is plain ESM with no runtime dependency; no schema library is available.
- The installed plugin is frozen; a new change's behavior only changes after repack and reinstall.

## Goals / Non-Goals

Goals:

- Let `reviews` declare any kebab-case entry name, each naming a profile whose `object` selects the directory or tree flow.
- Add `pipeline.beforeApply` and `pipeline.beforeArchive` as the only lifecycle role declarations, with `draft`/`apply` defaults.
- Lock every entry's object and parameters plus the pipeline into the policy.
- Name records and rounds by entry, preserving the existing `draft`/`apply` names.
- Accept the locked entry names from both review tools, and carry the entry through status, next actions, briefs, wakeups and cards.
- Record the `beforeArchive` entry and its record hash in the landed manifest.
- Keep the configuration page read-only and show entries and the pipeline.

Non-Goals:

- Changing finding ids, round tokens, report fields or pass criteria.
- Changing the pull-request scripts. The `review=pr` switch and the PR configuration are a follow-up change.
- Generalizing rebase extra rounds. Only an `apply` entry writes a rebase marker; a non-apply `beforeArchive` entry behind main gets no marker, land refuses, and the session resumes that entry normally.
- Relocking existing policies or rewriting existing records.
- A new save path on the configuration page.

## Decisions

### Entry table and flow selection

`reviews` becomes a table from entry name to profile name. The profile's `object` selects one of two flows:

| Profile object | Flow | Review object | Report contract |
| --- | --- | --- | --- |
| `directory` | directory flow | change artifacts and intent | draft report, blocked attempts, revisions |
| `tree` | tree flow | committed git tree | apply report, base, strict validation, waiver, extra rounds |

The entry name is a label. It does not select the flow, and `draft`/`apply` have no type privileges. A `pr` entry with a `tree` profile runs the tree flow without any PR-specific branch in the review core. Entry names follow `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`; the reader rejects any other key, and the record naming rejects an unsafe path segment again.

Why this shape: one dispatch point (`entry.object`) replaces the name-based branches, a new entry needs only configuration, and a directory entry can carry a name other than `draft`.

Alternative rejected: keep `draft`/`apply` special and add a third special case for `pr`. It preserves the hardcoding the change exists to remove and forces a new special case for every future entry.

### Pipeline as an explicit role table

`pipeline` has exactly `beforeApply` and `beforeArchive`. Missing values default to `draft` and `apply`, and the named entries must be declared. `beforeApply` must name a `directory` entry and `beforeArchive` a `tree` entry. The apply entry and archive entry are roles, not names: a project may use `planning` before apply and `pr` before archive.

Why explicit: with several directory entries, "the directory entry" no longer identifies one record; with several tree entries, neither does "the tree entry." Inferring a gate from object type would make the choice depend on declaration order. The pipeline is the one place that answers which record gates a lifecycle step.

Alternative rejected: keep the gates fixed to `draft`/`apply`. It cannot express a pull-request archive gate and would keep the name coupling the change removes.

### Policy schema version 3

The policy records:

```json
{
  "schemaVersion": 3,
  "pipeline": { "beforeApply": "draft", "beforeArchive": "apply" },
  "reviews": {
    "draft": { "object": "directory", "enabled": true, "reviewers": 0, "waitMinutes": 15, "reviewerModel": {} },
    "apply": { "object": "tree", "enabled": true, "reviewers": 0, "waitMinutes": 15, "reviewerModel": {} },
    "pr":    { "object": "tree", "enabled": true, "reviewers": 1, "waitMinutes": 15, "reviewerModel": {} }
  },
  "source": { "path": "openspec/reviews.json", "sha256": "...", "entries": { "draft": "standard-directory", "apply": "standard-tree", "pr": "pr-tree" }, "pipeline": { "beforeApply": "draft", "beforeArchive": "apply" } }
}
```

The object is locked because it selects the flow; a later profile edit must not move a running entry between flows. The source records entry-to-profile names so the page can show the origin without re-reading the file.

A policy without `pipeline`, without an entry `object`, or with `schemaVersion` below 3 is read as `draft` = directory, `apply` = tree, default pipeline, and reading never rewrites it. The one exception is the first start or resume with `configPath`: it SHALL supplement missing entry sections and the pipeline once. The supplemented policy records schema version 3 and each added entry's object; it adds no `source` and no object to an existing legacy section, and the reader fills those from the defaults. After that write the policy is locked and a later `configPath` is ignored for supplementing. A version 2 policy already carries the draft and apply sections; the defaults supply the missing facts.

### Record naming

| Entry | Record file | Round directory |
| --- | --- | --- |
| `draft` | `review.json` | `round-N` |
| `apply` | `apply-review.json` | `apply-round-N` |
| other | `<entry>-review.json` | `<entry>-round-N` |

The naming function takes the entry name and returns both facts. It rejects a name that is not a safe path segment, even though the configuration reader already enforces kebab-case. New entries need no migration; old records keep their names because `draft` and `apply` still map to the old paths.

Alternative rejected: one record file with an entry map. It would rewrite the existing record shape, complicate the per-entry round and report reads, and make partial updates harder.

### Flow ownership

The directory flow owns the artifact hash, intent, blocked-attempt revisions, length gate and execution preflight. The tree flow owns the commit, tree, base, strict validation, plan-change waiver and extra rounds. The differences live behind one `entry` value:

- A directory entry's `review` record is the existing draft shape.
- A tree entry's `review` record is the existing apply shape.
- The policy, report, finding and readiness contracts are shared.

This keeps the existing draft/apply contracts and makes `pr` a tree entry without a separate report schema.

### Baseline and gates

- A tree entry's default `baseline: "draft"` reads the record of the `pipeline.beforeApply` entry, not a hardcoded `draft` record. `baseline: "none"` keeps its existing exemptions and requires an explicit base.
- `openspec_apply_next` checks `pipeline.beforeApply`.
- `openspec_archive` and the land that archives check `pipeline.beforeArchive`.
- A gate entry that is disabled, undeclared, or unavailable (a tree entry without git) does not hold the step. This preserves the existing "disabled or unavailable review does not block archive" rule.
- Apply locks and the lifecycle lock are unchanged. Entry records are additional review state, not additional locks.

Why constrained: a `beforeApply` gate must resolve planning artifacts and a `beforeArchive` gate must resolve a committed tree. Allowing either object would force every gate, land and freeze path to define what a tree-before-apply or directory-before-archive record means. The config reader and policy lock reject the combination and name the entry and required object.

### Land manifest

Land reads the `beforeArchive` entry's record instead of a fixed `apply-review.json`. The manifest carries `beforeArchiveEntry` (the entry name, `null` without a review), `applyReviewId` and `reviewRecordHash` (the SHA-256 of that entry's record file, both `null` without a review). The pre-clear hash uses the `apply` record, because only `apply` writes `rebaseReview`; a non-apply `beforeArchive` entry behind main gets no marker and a normal resume instruction. A manifest without `beforeArchiveEntry` reads as `apply`, so existing manifests stay readable.

### Tool surface

- `openspec_review` and `openspec_reviewer` declare `review` as an optional plain string, not an enum, default `draft`; `dispose` and a finding `waive` require it.
- The accepted values come from the locked policy. A change without a policy resolves the value from the project review file on its first call (the same path that locks the policy).
- An unknown value fails before any record read and names the configured entries. The schema cannot enumerate dynamic entries, so the runtime check is authoritative and the description states the rule.
- Status, next actions, briefs, reviewer wakeups and cards carry the entry name. Start/resume messages use the entry name in `review=<entry>`.

### Cards and the page

- The card `kind` is the entry name. The file naming pattern does not change.
- The delivery rule selects `apply-review.json` for `apply`, `review.json` for `draft`, and `<entry>-review.json` for another entry. The cache key is the entry name.
- The collapsed summary renders the entry name where it rendered the review kind; a missing value renders `draft`. The existing Chinese labels are unchanged.
- The page lists profiles, entries, pipeline and locked sections; it remains read-only.

### Defaults and this repository

`lib/review/config.js` writes the explicit pipeline and the two default entries. This repository's `openspec/reviews.json` adds:

```json
"pr-tree": {
  "object": "tree",
  "enabled": true,
  "reviewers": 1,
  "waitMinutes": 15,
  "reviewerModel": { "source": "inherit" }
}
```

and `reviews.pr: "pr-tree"`. The pipeline stays `draft`/`apply`; the PR scripts switch it in the follow-up change. The `standard-tree` profile remains the local apply configuration.

## Risks / Trade-offs

- [Every `kind` branch must switch to an entry resolver] → add a single entry descriptor and route the tool, record, card and wakeup paths through it; keep the old draft/apply descriptors as the first two adapters. Tests use a `pr` entry to prove the resolver is not a second special case.
- [Downgrading reads the new policy with the old rules] → the previous plugin does not check `schemaVersion`. If an entry is renamed, it sees both gates as disabled; if the objects are swapped, it runs the wrong flow. Mitigate by removing the review directory or staying on the new plugin; do not write v3 over an existing v2 during a read.
- [A policy with several entries increases lock contention] → the review directory lock is already shared by draft and apply writes. Keep writes short and per record; do not add a second lock layer.
- [A dynamic `review` schema cannot enumerate entries] → the schema stays a plain string; the runtime error lists the locked entries. Tool descriptions state that the value must be a locked entry.
- [Record names collide with a reserved name] → kebab-case validation plus a fixed `review.json`/`apply-review.json` map; a name such as `review` maps to `review-review.json`, not a reserved path.
- [Cards from an older client do not know a new kind] → the plugin and client ship together; the payload carries the raw entry name and the client renders it as data, so an unknown name still displays.
- [Rebase extra rounds remain apply-specific] → only the `apply` entry writes a `rebaseReview` marker; a non-apply `beforeArchive` entry behind main gets no marker, land refuses, and the session runs `openspec_review action=resume review=<entry>` after rebase and retest.
- [The page must not become a write surface] → keep the page read-only; the only changes are the displayed entry and pipeline facts.
- [A read could rewrite a legacy policy] → reading never writes; only the first start or resume with `configPath` supplements once, and a byte test covers the no-write path.

## Migration Plan

1. Add the config parser and policy v3 locking with default pipeline and legacy read, including the one-time `configPath` supplement; land tests before the record changes.
2. Add the record naming and reader compatibility; keep `draft`/`apply` paths unchanged.
3. Route the review tool, reviewer tool, status, next actions and gates through the entry resolver. Defaults keep current calls working.
4. Update cards, delivery selection and the client summary; update the settings page.
5. Update the default configuration, this repository's `reviews.json`, `docs/review.md` and the README.
6. Verify: `npm run test:affected -- <paths>`, the full `npm run verify`, and `openspec validate --strict`.
7. Deploy: `npm run bundle:pack -- --force`, reinstall the tarball, restart the session. Existing changes keep their v2 policies and records; new changes read the entry model.

Rollback: reinstall the previous tarball. The previous plugin does not check `schemaVersion`: a renamed entry leaves both gates seen as disabled, and a swapped object runs the old flow. Remove the change's review directory or keep the new plugin installed for it. New `pr` records stay on disk and are ignored by an older plugin that has no `pr` entry.

## Open Questions

None that change the specs, the approach or the task breakdown.
