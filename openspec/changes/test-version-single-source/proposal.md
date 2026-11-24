# Proposal

## Why

The CLI pin and the Node baseline each already have one source: `package.json` `dependencies` for `@fission-ai/openspec`, `coverage.config.json` `primaryNodeMajor` plus `package.json` `engines.node` for the runtime. The restatements do not follow that source. The five skill frontmatter files and both contributor documents repeat the values, and the tests that guard them compare against hardcoded literals, so changing the source alone leaves stale copies that still pass.

## What Changes

- Derive the expected skill `metadata.upstream` from `PINNED_CLI_VERSION`, the constant that reads the `@fission-ai/openspec` dependency, instead of the literal `openspec@2.0.0`.
- Extend the contributor documentation test to scan `README.md` and `AGENTS.md` for every CLI version and Node major literal and to compare each one with its source, keeping the versions in the documents rather than removing them.
- Compare the `engines.node` range stated in `README.md` with `package.json`, and the range's major with `coverage.config.json` `primaryNodeMajor`.
- Update the CLI upgrade guide, which told maintainers to edit the derived skill assertion.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `project-invariants` `Consumers reference these values` requirement already requires consumers to reference the single source and to bind a documented restatement by a test; only the binding was missing, so this change sets `skip_specs: true`.

## Impact

- `test/skills.test.mjs`, `test/contributor-docs.test.mjs`
- `docs/upgrading-openspec-cli.md`
- No CLI version, Node baseline, dependency, schema or runtime behaviour change.
