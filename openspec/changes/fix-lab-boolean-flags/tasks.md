# Tasks

## 1. Parse switches without a value

- [x] 1.1 Give every flag other than `--name`, `--mode`, `--plugin` and `cache prune --keep` no value, so the token after it stays a positional argument.

## 2. Guard the parser

- [x] 2.1 Assert that a switch followed by a scenario path keeps the path positional, for every switch and for an unknown flag.
- [x] 2.2 Assert that value flags and `cache prune --keep` still consume the next token.
- [x] 2.3 Confirm the switch assertion fails against the previous parser.

## 3. Document the rule

- [x] 3.1 State which options are switches in `docs/lab.md` and guard the sentence in `test/lab-doc.test.mjs`.

## 4. Verify

- [x] 4.1 Run `node --test test/lab-cli.test.mjs` and `node --test test/lab-doc.test.mjs`.
- [x] 4.2 Run `npm test` and `npm run verify` on Node 24 after the implementation commit.
- [x] 4.3 Run `openspec validate fix-lab-boolean-flags --strict`, `npm run openspec:check` and `npm run check:requirement-length`.
