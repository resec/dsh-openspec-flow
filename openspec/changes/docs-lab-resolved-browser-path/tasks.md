# Tasks

## 1. Correct the scenario

- [x] 1.1 State in the missing-browser scenario that the install command's path is the resolved browser directory — the environment's value when set, otherwise `.cache/lab/pw-browsers` — and keep the requirement description and the other scenarios unchanged.
- [x] 1.2 Confirm `scripts/lab/core/doctor.mjs:232` resolves the path that way and `docs/lab.md:9` already documents it.

## 2. Guard the document

- [x] 2.1 Pin the resolved-path sentence in `test/lab-doc.test.mjs`.

## 3. Verify

- [x] 3.1 Run `openspec validate docs-lab-resolved-browser-path --strict` and `npm run openspec:check`.
- [x] 3.2 Run `node scripts/check-requirement-length.mjs` and `node --test test/lab-doc.test.mjs`.
- [x] 3.3 Run `/tmp/b3/gates.sh docs-lab-resolved-browser-path` (strict validation, `openspec:check`, requirement length, generated skills, `check:pr`, `npm run verify`).
