# Proposal: redact-host-paths

## Why

Tracked content contains an absolute path under the author's home directory, which exposes the user name, home directory and workspace layout. The path exists in every reachable commit, so deleting it at HEAD does not remove the exposure.

## What Changes

- Replace the absolute installation path in `README.md` with the host-neutral placeholder `/path/to/dsh-openspec-flow`.
- Rewrite every reachable commit so text files and the historical zstd session fixture contain no host-specific absolute path.
- Preserve author, committer, dates and commit messages during the rewrite.

**BREAKING** Every commit SHA changes. The sibling `dsh-openspec-flow-eval` repository pins four commits from this history and must remap them in its own change.

## Capabilities

### Modified Capabilities

- `development-workflow`: add a repository-hygiene requirement that tracked content and reachable history carry no host-specific absolute paths.

## Impact

- `README.md` line 98.
- Historical blobs of `README.md`, `eval/fixtures/dumps/headless-official.yml`, `eval/fixtures/dumps/headless-plugin.yml` and `eval/fixtures/sessions/sample.v4.jsonl.zstd`; the `eval/` directory is no longer tracked at HEAD.
- No runtime code, dependencies or tool behavior change.
- `dsh-openspec-flow-eval` must update its fixture pins to the rewritten commits.
