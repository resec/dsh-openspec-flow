# fix-review-card-lookup

Fix duplicate review cards and slow review card lookup by deduplicating shared review roots, filtering cards by session key, caching git root resolution, batching turn card requests, and merging delivery writes.

## Verification

- `npm test` on Node v24.22.2: 1032 passed, 0 failed.
- `npm run verify`: line 98.56%, branch 93.68%, function 99.11%; no violations.
- `npm run openspec:check`: 94 items passed, 0 failed.
- `reviewCards/get` on a 56-turn session: one batch returned 23 unique cards in 10 ms on a warm run, with no duplicate card.
