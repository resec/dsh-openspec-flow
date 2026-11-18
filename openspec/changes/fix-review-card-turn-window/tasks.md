# Tasks

## 1. Host delivery window

- [ ] 1.1 Add the optional `to` input to `readCards`, normalize it with `new Date(value).toISOString()` like `from`, and reject a present but unparsable value with `reviewCards/bad-argument`; verify endpoint tests cover an offset-form bound comparing by instant and an unparsable bound binding nothing.
- [ ] 1.2 Require `writtenAt <= to` before binding an unclaimed card, keeping the existing `from`/watermark lower bound; verify an endpoint test leaves a card written after the turn end unbound and the owning later turn binds it.
- [ ] 1.3 Cap the per-session watermark at `max(existing, min(now, to))` when `to` is present and keep `now` otherwise; verify with `createReviewChannel({ now })` a replay where the historical turn skips a later card, the watermark stops at the turn end, and the later turn binds that card without `from`.
- [ ] 1.4 Order returned cards by phase then `writtenAt` (missing last) with `round` as the tie-break; verify an endpoint test lists the earlier draft round before the later apply round, every review card before every resolution card, and still returns a bound card on refresh.

## 2. Client query

- [ ] 2.1 Send `from` from `turn.start.time` and `to` from `turn.end.time` as ISO, only when each is finite and within 2000-01-01..2100-01-01 in milliseconds; verify the client test asserts both `payload.from` and `payload.to`.
- [ ] 2.2 Omit a bound for a missing, non-finite, seconds-valued or nanosecond-valued time; verify the client test covers each odd numeric `time` without throwing and without sending that bound.
- [ ] 2.3 Include `turn.start?.time` and `turn.end?.time` in the query effect dependencies; verify by extending the client test's fake `useEffect` to record its dependency array, asserting it contains both times, and re-rendering with a different end time issues a second call.

## 3. Slot contract

- [ ] 3.1 Confirm `TurnLocation.start`/`end` and `SessionEvent.time` against the installed DSH types and record the `conversation.chat.turnTail` row in `docs/upgrading-dsh-runtime.md`; verify with `grep -n 'chat.turnTail' docs/upgrading-dsh-runtime.md` and confirm the row names the package and the millisecond time.

## 4. Documentation

- [ ] 4.1 Describe the turn window bound, the watermark ceiling and the write-time ordering in `docs/review.md` and `README.md`, and add those phrases to `test/review-doc.test.mjs`; verify with `node --test test/review-doc.test.mjs`.

## 5. Integration

- [ ] 5.1 Run `npm run test:affected -- client.js lib/review/settings.js test/review-cards-endpoint.test.mjs test/review-client.test.mjs` and confirm it passes.
- [ ] 5.2 Run `npm run verify` on Node 24 and confirm the test summary and coverage verdict pass.
- [ ] 5.3 Run `openspec_inspect` with `action: "validate"` and `strict: true` and confirm no findings remain.
