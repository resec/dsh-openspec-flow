# Proposal: Fix the review-card turn window

## Why

The delivery endpoint binds unclaimed cards to the requesting turn using only a lower bound: the per-session watermark at `card-delivery.json`, because the turn tail never sends a start time (`TurnLocation.start` is an event object, not a string, so the current probe is dead). A historical turn's tail stays mounted after the turn ends, so when it is re-mounted later (for example on a page refresh) it claims cards written during a subsequent turn and binds them to the old turn. In the observed case, the draft round-4 card written at 12:13 and the apply round-1 card written at 12:29 were both bound to turn 21; one query returned both.

The same watermark is advanced unconditionally to the request time, even when the request binds nothing. Adding only an upper bound would therefore make the reported apply card vanish: the historical turn would skip it and push the watermark past it, and the later turn would skip it again as older than the watermark.

The returned cards are then ordered by phase and `round` alone. `apply` round 1 sorts before `draft` round 4 because 1 < 4, so a card written later is displayed first and the turn tail reads as if apply had been followed by another draft round.

The existing `review-cards` requirements define no upper bound, no watermark ceiling, no ordering rule, and no Slot contract for the times the client sends.

## What Changes

- **Client window**: `ReviewCardTail` sends the turn start and end times from the Slot's `TurnLocation` (`start.time` and `end.time`, the `turn/start` and `turn/end` event times in milliseconds) as `from` and `to`, after converting each to ISO. A missing, non-finite or out-of-range (before 2000-01-01 or after 2100-01-01) value is omitted; the `effect` depends on both times so a late-provided end re-queries.
- **Host upper bound**: `reviewCards/get` accepts an optional ISO `to`. An unclaimed card is bound only when `writtenAt` is at or after the existing cutoff and at or before `to`. A request without `to` keeps the current behavior. A present but unparsable `to` returns `reviewCards/bad-argument`; `from` keeps its existing lenient handling for compatibility.
- **Watermark ceiling**: when `to` is present, the per-session watermark advances no further than `min(now, to)`; a skipped later card therefore stays eligible for the turn that owns it. Without `to`, the watermark advances to the request time as before.
- **Ordering**: returned cards keep the phase order (review before resolution) and are ordered by `writtenAt` ascending inside a phase, with `round` as the tie-break. The cross-kind `round` comparison is removed.
- **Slot contract**: record `turnTail`'s `TurnLocation` props (`start`/`end` as `SessionEvent` with millisecond `time`) in the DSH coupling table in `docs/upgrading-dsh-runtime.md`, so the client's time source is checked against the pinned DSH instead of being assumed.
- **Tests and docs**: endpoint tests cover the upper bound, the watermark ceiling and replay of the reported refresh sequence with an injected clock; client tests cover the window, the omission guards and the `time`-keyed effect; the doc test asserts the window and ordering phrases; `docs/review.md` and `README.md` describe the window and the ordering.

## Capabilities

### Modified Capabilities

- `review-cards`: the client sends the turn window; the Host binds unclaimed cards only inside the window, bounds the watermark by the turn end and orders the returned cards by write time within a phase.

## Impact

- **Client**: `client.js` (`ReviewCardTail` payload and effect).
- **Host channel**: `lib/review/settings.js` (`readCards`).
- **Tests**: `test/review-cards-endpoint.test.mjs`, `test/review-client.test.mjs`, `test/review-doc.test.mjs`.
- **Docs**: `docs/review.md`, `README.md`, `docs/upgrading-dsh-runtime.md`.
- **Compatibility**: `to` is optional and additive; existing `card-delivery.json` files, card files, review records and tool results are unchanged. A card already bound to a wrong turn under the previous behavior stays bound; the change does not rewrite bindings.
