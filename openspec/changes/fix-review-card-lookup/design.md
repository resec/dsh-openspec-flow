# Design: Fix review card lookup

## Context

See `proposal.md` - Why. The Host resolves every live agent's project root, maps each root to a review root, and answers `reviewCards/get` by scanning every review directory of every project. Two project roots of one git repository (main worktree and an apply worktree) resolve to the same `<git common dir>/openspec-flow/review`, so the same card file is read and pushed twice. Each completed turn tail queries the endpoint independently, so a session with many turns issues many sync Host calls, and each call parses every historical card file and runs `git` for every legacy record directory.

## Goals / Non-Goals

- Goals: one physical card per request; at most one scan of each review root path per request; file selection by the requested session before JSON parsing; one batch turn request per client session mount group; the same per-session watermark as sequential single-turn requests; a single write of `card-delivery.json` per directory per batch.
- Non-Goals: changing the card file format, changing the meaning of turn binding or the withholding rule, changing `reviewPolicies/list` (it still lists one project per root), adding a protocol version or a new dependency, rewriting the vendor-side client beyond `client.js`.

## Decisions

### Deduplicate by card file path, not by project

`readCards` keeps a `Set` of absolute card file paths and a `Map` from each root path to its scan result. `cardFilesOf` scans the primary root and the legacy root independently, each at most once per request, and a project combines the two cached lists while applying its own record-name check to the legacy list. The shared primary root of the main and apply worktrees is therefore listed once and parsed once, while each project's distinct legacy root is still read. The path set drops any remaining duplicate. Alternative: keying scans by the `(reviewRoot, legacyReviewRoot)` pair would never hit for two worktrees of one repository, because their legacy roots differ; that misses the change's main case. The channel accepts an optional `io` seam (`readdirSync`, `statSync`, `readFileSync`, `existsSync`, `writeJsonAtomic`) so tests count directory listings and record write arguments for the delivery assertion; a bound-card write and the `card-delivery.json` write are told apart by the first argument.

### Select card files by the session key in the file name

The file name contract is `cards/<sessionKeyOf(sessionId)>-<phase>-<round>.json`. `cardFilesOf` reads the directory names once, filters file names by `${sessionKeyOf(sessionId)}-`, and only then parses. The legacy copy check moves after the filter, so a legacy record directory with no matching card costs a `readdir` and a `stat`, not two `git` processes. Payload session id and schema stay validated after the read. Alternative: parse every file and filter the payload, as today; rejected because it is the dominant cost and the name contract is already part of the spec.

### Cache git root resolution per project root

`gitCommonDir` and `gitTopLevel` are called for every project and for every legacy record directory that needs a record-name check. The results are cached in module-level `Map`s keyed by project root; only successful results are stored. `clearGitRootCache()` is exported for tests and for callers that change a worktree. A new worktree path has no cache entry, so its first resolution runs `git`; a removed worktree path is no longer returned by `knownProjects`, so a stale entry is not used. Alternative: request-scoped cache only; rejected because a 56-turn session would still spawn `git` for every request, though the batch path reduces that to one request.

### Extend `reviewCards/get` with `turns` and `byTurn`

The single-turn path stays byte-for-byte compatible: `{ sessionId, turn, from?, to? }` returns `{ cards }`. A batch is `{ sessionId, turns: [{ turn, from?, to? }] }`, at most 64 entries, each turn positive and each present window validated by the existing rules. The Host sorts the turns ascending, applies the existing per-turn binding, withholding, window, watermark and ordering rules in that order, and answers `{ byTurn: { "<turn>": [cards] } }` with exactly one entry per requested turn, empty when no card answers. A repeated turn collapses to its first entry and is bound once. It does not repeat the cards in a merged array, so the payload stays proportional to the cards returned. An empty `turns` array answers an empty `byTurn`. More than 64 entries or a non-positive turn answers `reviewCards/bad-argument` with no binding. Sending the batch is the client's choice; the Host never trusts the client's order.

### Bind a batch under one scan and one lock per directory

The batch implementation scans once, groups files by review directory, and takes each directory's review lock once. Inside the lock it walks the sorted turns: bind `data.turn === turn` cards, then unclaimed cards in the turn window, apply withholding, and advance an in-memory `delivery.sessions[key].lastDeliveredAt`. After the last turn it writes `card-delivery.json` once with the final watermark. Sequential single-turn requests produce the same final state because each request starts from the persisted watermark and the batch advances the same state in the same order. A directory lock failure or an unreadable card keeps the existing safe-degradation behavior: that directory contributes no cards for the affected turns, while every requested turn keeps its `byTurn` entry and the other directories still answer. The entry is empty or carries the remaining directories' cards; the Host never synthesizes an error response for a per-directory failure.

### Merge client queries per session

The client bundle gains a small batcher in module scope. `ReviewCardTail` enqueues `{ sessionId, turn, from, to }`; the batcher groups by session, flushes in a microtask, sends one batch per 64 turns, and resolves each entry from `byTurn`. Entries are keyed by session, turn and window so a strict-mode double mount does not send twice. The key lives only in that session's pending batch map and is dropped when the batch flushes, so a later remount of the same turn issues a new request instead of rendering nothing from a stale key. A whole-batch failure falls back to single-turn requests only for the entries in that batch; a missing `byTurn` entry resolves to an empty array as a last resort. The component keeps its existing `alive` guard, so a late answer after unmount does not set state. Alternative: a session-wide "all cards" request; rejected because it would have to choose a turn for unclaimed cards and would change the binding rule.

### Keep the batcher bounded and observable

The batch size cap is 64 turns, chosen to keep the request body under 4 KB and the Host's lock hold short; the body stays far below the 1 MB channel cap. The batcher is exposed through the existing `__test` seam as a pure factory taking the RPC call function, so the merge, dispatch and fallback paths are testable without React.

## Risks / Trade-offs

- [Batch binding differs from sequential binding] → Keep one per-turn function and one in-memory delivery state, and test batch against sequential runs for bindings, watermark, `to` bounds, withholding and legacy cards.
- [File-name filtering hides a card whose name does not follow the contract] → The contract is already specified and tested; rename the existing corrupt and invalid-shape fixtures inside the session-key set, add a scenario that a matching legacy card is still read, and document the rule.
- [A batch failure multiplies requests through fallback] → Fallback only for the failed batch's turns, cap 64 per batch, and keep the existing per-turn failure behavior; the fallback is the current behavior, so the worst case equals today.
- [Git root cache goes stale after a worktree change] → Cache successes only, export `clearGitRootCache()`, and rely on `knownProjects` no longer naming a removed path. A project root whose git common directory changes under a stable path keeps the cached value until the caller clears it; no production caller is scheduled, so the Host restart or the test seam is the reset path. No path is invented.
- [A long lock hold in the batch] → One lock per directory, sorted in-memory binding, 64-turn cap; a lock failure keeps the existing partial-answer behavior and every turn keeps its entry.
- [`lib/review/store.js` is also edited by `pack-ignores-openspec-dirt`] → Rebase this change after that change lands and rerun the store tests; do not stage both changes' edits in one commit.
- [`reviewPolicies/list` still shows two project entries] → Out of scope; the proposal records it, and the card path is the reported user-visible failure.

## Migration Plan

No data migration: card files, record files and `card-delivery.json` keep their formats. The endpoint addition is backward compatible, so older clients keep the single-turn path. Rollback is a single revert of the implementation commit; no state has to be repaired. Deployment requires `npm run bundle:pack` and reinstalling the tarball because the running plugin is frozen; apply after `land-apply-worktree` archives to avoid crossing its worktree lifecycle changes, and rebase after `pack-ignores-openspec-dirt` if it lands first because both edit `lib/review/store.js`.

## Open Questions

None that change the specs or the task split. The latency is measured after one warm-up `reviewCards/get` for the same session; the 300 ms target is a reported acceptance check, not an automated gate.
