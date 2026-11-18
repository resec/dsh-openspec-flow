# Design: Fix the review-card turn window

## Context

See `proposal.md` - Why. The delivery query is `reviewCards/get` from `client.js` to `lib/review/settings.js`.

The Slot contract is now checked against the pinned DSH, not assumed:

- `conversation.chat.turnTail` owner props are `TurnTailOwnerProps { turn: TurnLocation; seq: number; openFile }`, confirmed through the live client Slot inspection.
- `TurnLocation` (in `@deepseek-ai/dsh-client-ui-conversation`, `contract/conversation.d.ts`) carries `turn`, `start: SessionEvent<'turn/start'> | undefined`, `end: SessionEvent<'turn/end'> | undefined`, `status` and `steps`.
- `SessionEvent.time` is a millisecond number (`@deepseek-ai/dsh-session`, `types.d.ts`), and the session log stores those values as epoch milliseconds.
- The chat package's `tailData` copies `end.event.time` into the `TurnTailChatData` location data; that object is not the owner prop. The owner `turn` is the `TurnLocation`.

The current client probes `turn.start` with `typeof === 'string'`, but `start` is a `SessionEvent` object, so `from` is never sent and every delivery falls back to the per-session watermark. The watermark records the previous request time, not a turn boundary, which is why a historical turn re-mounted after a later card was written claims that card.

## Goals / Non-Goals

**Goals**

- Send the real turn window (`start.time` and `end.time`) so the Host can bind cards written inside that turn only.
- Stop the watermark from advancing past a card the request had to skip, so the owning later turn can still bind it.
- Order the cards of one turn by write time, so a later apply round is not listed before an earlier draft round.
- Keep the existing client and existing delivery files compatible; no card-file or review-record migration.

**Non-Goals**

- Changing the card file format, the payload fields, the write points or the review state.
- Inferring the turn from a card's own contents or from the review record. A reviewer session writes changer cards and has unrelated turn numbers.
- Rewriting bindings already persisted under the previous behavior.
- Tightening `from` parsing. `from` existed before this change and an older client may send it; the lenient fallback stays.

## Decisions

### The client sends both bounds from `TurnLocation`

`ReviewCardTail` reads `turn.start.time` and `turn.end.time`. Each bound is sent as `new Date(time).toISOString()` only when `Number.isFinite(time)` and `time` is within `Date.UTC(2000, 0, 1)..Date.UTC(2100, 0, 1)`; anything else is omitted so a seconds-valued, nanosecond-valued or otherwise out-of-range prop cannot hide every card or throw inside the effect. The effect depends on `turnNumber`, `turn.start?.time` and `turn.end?.time`, because the tail data is assembled at `turn/end` and a prop that arrives later must re-query with `to`.

Sending both bounds also repairs the dead `from` path. The Host then computes the window `[from, to]` for unclaimed cards instead of relying on the watermark, which is the only exact basis the Host can have.

Alternative considered: keep `from` dead and send only `to`. Rejected because the lower bound would still be the previous request time; a refresh that moves the watermark would exclude cards in the same turn that were not delivered yet.

### The watermark advances no further than `to`

With `to` present, the Host writes `lastDeliveredAt = max(existingWatermark, min(nowIso, to))`. Without `to`, it writes `nowIso` as before.

Why this is required: a historical tail that skips a card written after its end would otherwise push the watermark to the request time. The owning turn would then see the card as older than the watermark and skip it too, so the card would never render. Capping the watermark at `to` keeps every `(to, now]` card eligible.

An existing watermark above `to` (written by an older request without bounds) is not lowered; that is a one-time legacy condition and is listed as a residual risk.

### `to` is strict, `from` stays lenient

A missing `to` keeps today's behavior. A present but unparsable `to` returns `reviewCards/bad-argument` and binds nothing; a broken new client should fail visibly instead of silently dropping the bound and re-opening the over-claim. `from` keeps its current lenient normalization for backward compatibility, and both accepted values are normalized with `new Date(value).toISOString()` before comparison, so an offset form compares by instant.

### Cards are ordered by write time inside a phase

The Host collects `{ payload, writtenAt }` for every returned card, sorts by phase rank (`review` before `resolution`) and then by `writtenAt` ascending (a missing time sorts last), with `round` as the tie-break, and maps back to payloads. The payload contract does not change.

Alternative considered: add `writtenAt` to the payload and sort in the client. That changes the payload contract and duplicates ordering logic in the client.

## Risks / Trade-offs

- **A newer client against an older Host** → The older Host reads `from` (now sent) but ignores `to`, so a card written after the turn can still be claimed by a re-mounted old tail. The bundle ships client and Host together; the upgrade note states that the window takes effect after the plugin bundle is reinstalled.
- **A legacy watermark already past a pending card** → The bound card cannot be recovered by the new code because the watermark is not lowered. This is limited to records produced by the old behavior; a fresh review path is unaffected.
- **A turn tail without `start` or `end`** → The request omits the bound and falls back to the watermark. The shipped Slot always provides both for a completed turn; an older Slot keeps the previous behavior.
- **Clock sources** → `writtenAt` and `SessionEvent.time` both come from the same process and the card is written before `turn/end`, so `writtenAt <= to` holds; the comparison is inclusive.
- **A card written after its own `turn/end`** → It is not returned for that turn and stays unbound for the next turn. No current write point does this; a future write point must run inside the turn.

## Migration Plan

No data migration. Deploy the plugin bundle; existing `card-delivery.json` and card files stay readable. Rollback is a bundle reinstall of the previous version; a card bound under the previous behavior stays bound and is still returned for its turn.
