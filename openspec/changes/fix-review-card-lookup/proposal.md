# Proposal: Fix review card lookup

## Why

When a git repository has both its main worktree and an apply worktree live, `knownProjects()` returns both project roots. Both roots resolve `reviewRoot()` to the same `<git common dir>/openspec-flow/review`, and `reviewCards/get` scans that directory once per project without deduplicating, so one physical card is returned twice: the same resolution card was observed twice in one turn tail, and a read-only reproduction found 68 duplicate files in one lookup. The same lookup is also proportional to all historical cards. Every completed turn tail calls the endpoint; each call parses every card file of every project (259 unique files, about 6 MB here) and spawns two `git` processes for each legacy record directory (49 directories) before filtering by session. Opening a session with 56 turns consequently blocks the Host event loop for seconds.

## What Changes

- Deduplicate card files by absolute path across projects, and scan each review root at most once per request.
- Filter card files by the session-key file-name prefix before parsing, and skip the legacy migration check for directories with no matching card.
- Cache `gitCommonDir()` and `gitTopLevel()` per project root in `lib/review/store.js`, with an exported `clearGitRootCache()`.
- Extend `reviewCards/get` with an optional `turns` array and a `byTurn` response. The single-turn request and response stay unchanged.
- Merge the client's per-turn `reviewCards/get` calls per session and dispatch the `byTurn` result; fall back to single-turn calls when a batch fails.
- Write `card-delivery.json` once per review directory in a batch, using the final watermark after all turns.
- Update `docs/review.md` and the README for unique delivery, batch requests, the client merge and the git root cache.
- No card file format change, no endpoint rename, no new dependency. The single-turn path remains for older clients.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-cards`: add unique per-file delivery, the batch turn request and the client's per-session merge, while keeping single-turn behavior and every existing delivery rule.
- `review-documentation`: document unique delivery, batch requests, the client merge and the git root cache.

## Impact

- `lib/review/settings.js` (`readCards`, `cardFilesOf`), `lib/review/store.js` (`gitCommonDir`, `gitTopLevel`, cache clear), `client.js` (request batcher and `ReviewCardTail`), `test/review-cards-endpoint.test.mjs`, `test/review-client.test.mjs`, `test/review-store-root.test.mjs`, `test/review-doc.test.mjs`, `docs/review.md`, `README.md`.
- The active `pack-ignores-openspec-dirt` change also edits `lib/review/store.js`; the two changes rebase and rerun the store tests before either lands.
- `reviewPolicies/list` still lists one entry per project root; this change fixes card delivery only.
- A batch request stays far below the 1 MB channel body cap, so no protocol version bump is needed.
