# budget-cli

A small Node CLI that reads a JSON transaction file and prints a summary.

```sh
node src/cli.js transactions.json
node --test test/
```

Each transaction is `{ "date": "YYYY-MM-DD", "amount": "12.34", "note": "..." }`.
