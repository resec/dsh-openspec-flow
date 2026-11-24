# Tasks

## 1. Bind the skill frontmatter assertion

- [ ] 1.1 Derive the expected `metadata.upstream` from `PINNED_CLI_VERSION` instead of the `openspec@2.0.0` literal.

## 2. Bind the documentation literals

- [ ] 2.1 Scan `README.md` and `AGENTS.md` for every CLI version and Node major literal and compare each with `package.json` and `coverage.config.json`.
- [ ] 2.2 Compare the `engines.node` range in `README.md` with `package.json`.
- [ ] 2.3 Update the CLI upgrade guide so it no longer tells maintainers to edit the derived assertion.

## 3. Verify

- [ ] 3.1 Run `node --test test/skills.test.mjs test/contributor-docs.test.mjs`.
- [ ] 3.2 Temporarily bump the `@fission-ai/openspec` dependency and `coverage.config.json` `primaryNodeMajor` by one; confirm the new assertions fail; restore both files.
- [ ] 3.3 Run `/tmp/b3/gates.sh test-version-single-source`.
