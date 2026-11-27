# Review entry model

## Why

The review configuration hardcodes `draft` as the directory review and `apply` as the tree review. `reviews` rejects any other entry, and policy, record files, cards, reviewer messages and gates all branch on those two names. A pull-request review therefore cannot carry its own profile and record without rewriting a copied configuration or reusing the apply entry. Reviews should be selected by what they review — a directory or a committed tree — while entry names stay a configuration choice.

## What Changes

- `profiles` continues to map a name to an object type plus review parameters. `reviews` becomes an entry table whose keys are arbitrary kebab-case entry names, each naming a profile; an entry's profile `object` selects the directory or tree flow instead of the entry name.
- A top-level optional `pipeline` names `beforeApply` and `beforeArchive`; omitted values default to `draft` and `apply`. `beforeApply` must name a directory entry and `beforeArchive` a tree entry. The apply gate checks the `beforeApply` entry's record and the archive and land gates check the `beforeArchive` entry's record.
- Review records are named by entry: `draft` keeps `review.json` and `round-N`, `apply` keeps `apply-review.json` and `apply-round-N`, and every other entry uses `<entry>-review.json` and `<entry>-round-N`. Legacy records keep their names and remain readable.
- `openspec_review` and `openspec_reviewer` accept any entry declared by the locked policy; the `review` parameter is a plain string defaulting to `draft`, except `dispose` and a finding `waive`, which require it. Status, next actions, briefs and wakeups carry the entry name.
- The policy locks every entry's object and parameters plus the pipeline. Its schema version rises to 3; a policy without the new fields is read as `draft`/`apply` with the default pipeline and is not rewritten. The first start or resume with `configPath` SHALL supplement missing entry sections and the pipeline once, recording schema version 3 and added-entry objects without adding a source or an object to a legacy section; the supplemented policy is then locked and later `configPath` calls do not supplement.
- The land manifest records the `beforeArchive` entry name and that entry's record id and hash, and land reads that entry instead of a fixed `apply-review.json`.
- Review cards use the entry name as their `kind`; the delivery rule selects the record by entry, and a card outside `draft`/`apply` renders its entry name.
- The configuration page lists entries and the pipeline. `openspec_init` writes the default pipeline explicitly, and this repository's `openspec/reviews.json` adds a `pr-tree` profile and a `reviews.pr` entry.
- The pull-request scripts that would call `review=pr` are a follow-up change; this change leaves `scripts/pr-review-*.mjs` untouched and does not change finding ids, round tokens, report fields or the pass criteria.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: policy locking, record naming, entry-driven review flow, reviewer rounds, gates and land binding.
- `review-configuration`: `profiles`/`reviews`/`pipeline` schema, defaults, validation and the read-only page.
- `review-cards`: card `kind` and record selection follow the entry.
- `tool-surface`: the `review` parameter, status, next actions and lifecycle gates follow the locked entries.
- `review-documentation`: the review document and README describe entries, the pipeline, the one-time supplement and the record layout.
- `apply-worktree`: land reads and records the `beforeArchive` entry's review file in the landed manifest.

## Impact

- Runtime: `lib/init.js`, `lib/policy.js`, `lib/review/config.js`, `lib/review/entry.js`, `lib/review/policy.js`, `lib/review/record.js`, `lib/review/store.js`, `lib/review/submit.js`, `lib/review/readiness.js`, `lib/review/brief.js`, `lib/review/reviewer-tool.js`, `lib/review/wakeup.js`, `lib/review/cards.js`, `lib/review/settings.js`, `lib/tools/review.js`, `lib/tools/apply.js`, `lib/tools/write.js`, `lib/worktree/land.js`, `index.js` and `client.js`.
- Configuration: `openspec_init` defaults and this repository's `openspec/reviews.json`.
- Documentation: `docs/review.md`, `README.md` and the shipped skill or policy text that names review kinds.
- Tests: configuration, policy, record, review flow, reviewer, gates, `test/worktree-land.test.mjs`, cards, settings and documentation suites.
- Out of scope: `scripts/pr-review-*.mjs`, pass criteria, finding ids, round tokens and report fields.
