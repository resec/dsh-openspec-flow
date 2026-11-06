# Feature request: monthly totals

The budget CLI currently prints one total for a transaction file. Add a monthly
breakdown without changing the existing summary output.

## Requirements

1. In `src/report.js`, export `monthlyTotals(transactions)`.
   - Each transaction has a `date` string in `YYYY-MM-DD` form and an `amount`
     accepted by `parseAmount`.
   - Group amounts by the `YYYY-MM` prefix and return an array of
     `{ month: 'YYYY-MM', total: number }` sorted by month ascending.
   - Round each total with `round2` from `src/ledger.js`.
   - Throw an `Error` whose message contains `invalid date` when a date is not
     a valid `YYYY-MM-DD` calendar date. Let `parseAmount` errors propagate.
2. In `src/cli.js`, add a `--by-month` flag. The invocation is
   `node src/cli.js --by-month <file>`. With the flag, print one line per month,
   `YYYY-MM <formatCurrency(total)>`, ascending; without it, print the existing
   summary line. Keep the current usage error for a missing file.
3. Add tests for the new API and CLI mode; keep the existing tests passing.
4. Update `README.md` with the new flag and the `monthlyTotals` API.
5. Do not add dependencies. Use `node --test`.

## Workflow

- Create the change as `add-budget-report` with a proposal, a spec delta for a
  new `monthly-report` capability, an optional design, and tasks.
- The user confirms the change name before creation and confirms the start of
  apply; do not edit implementation code before that.
- Before reporting completion, run `openspec_validate add-budget-report` and
  `node --test test/`, and report both.
