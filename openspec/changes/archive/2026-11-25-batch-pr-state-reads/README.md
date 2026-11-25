# batch-pr-state-reads

Batch the state read behind state --cleanup so it stops issuing one GitHub call per tracked pull request.

## Verification results

Measured on 2026-11-25 with Node 24.22.2 against the live repository, whose
tracked set held 85 pull requests and whose local owner set held 3 entries at
the time of the run (88 numbers):

- `node scripts/pr-review-watch.mjs state --cleanup`: 652 ms and 1 GitHub call,
  against 48,523 ms and 85 calls recorded for the previous round.
- `npm run verify` on Node 24: pass, no coverage violations (line 98.65%,
  branch 93.76%, function 99.23%).
