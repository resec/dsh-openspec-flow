# Tasks

## 1. Document the gate

- [ ] 1.1 Add the "Pull-request change check" subsection to `CONTRIBUTING.md` under "Local checks and evidence", naming the four checks, the `--base` invocation, the `--head` default, the CI base and head, and the status-2 outcome of a bare run.

## 2. Guard the document

- [ ] 2.1 Assert in `test/contributor-docs.test.mjs` that `CONTRIBUTING.md` names `check:pr` and gives `npm run check:pr -- --base origin/main`.
- [ ] 2.2 Add the cross-check that every `npm run <script>` in `CONTRIBUTING.md` exists in `package.json` scripts.
- [ ] 2.3 Confirm both assertions fail after removing the new subsection.

## 3. Verify

- [ ] 3.1 Run `node --test test/contributor-docs.test.mjs`.
- [ ] 3.2 Run `openspec validate docs-check-pr-usage --strict`, `npm run openspec:check` and `npm run layout:check`.
- [ ] 3.3 Run `npm run verify` and `npm run check:pr -- --base origin/main`.
