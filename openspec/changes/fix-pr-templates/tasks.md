# Tasks

## 1. Align the templates

- [ ] 1.1 Make the pull request template require exactly one active change and keep only the six body sections the repository uses.
- [ ] 1.2 Add `npm run check:requirement-length` to the self-check command list in the pull request template and both issue templates.

## 2. Cover the templates

- [ ] 2.1 Add `test/templates.test.mjs` for the three templates, the six sections, the exactly-one wording and the command lists.
- [ ] 2.2 Cross-check every `npm run <script>` named in a template against `package.json` scripts.

## 3. Verify

- [ ] 3.1 Run `node --test test/templates.test.mjs` and confirm the old wording fails the test.
- [ ] 3.2 Run `/tmp/b3/gates.sh fix-pr-templates`.
