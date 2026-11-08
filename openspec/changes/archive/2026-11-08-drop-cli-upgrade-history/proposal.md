# Drop the upgrade history from the CLI upgrade guide

## Why

`docs/upgrading-openspec-cli.md` describes the upgrade procedure but also carries the record of the last completed upgrade: a version-to-version comparison section, dated contract-check measurements and version-specific examples. Readers cannot tell instructions from history, and the history goes stale the moment the pin moves; the evidence for a completed upgrade already lives in that change's artifacts and commit.

## What Changes

- Remove the `## 版本对照：1.16.0 到 1.16.1` section: the completed upgrade's upstream facts, pre-upgrade checks, edit inventory and measured behavior.
- Remove the dated `1.16.0`/`1.16.1` contract-check result from `### 输出解读`, leaving that section to explain the output marks only.
- Rewrite the version-specific examples in the decision section and the negative checks as version-neutral statements.
- Replace `--candidate 1.16.1` examples with the `<version>` placeholder, and point the sources section at the releases index instead of the two fixed release tags.
- Keep the current-pin baseline, the CLI coupling inventory and every procedure step unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: the requirement "OpenSpec CLI upgrades follow a documented procedure" gains the constraint that the guide describes the procedure and the current pin only and carries no completed upgrade's record.

## Impact

- Edited: `docs/upgrading-openspec-cli.md`.
- Updated on archive: `openspec/specs/development-workflow/spec.md`.
- Unchanged: runtime code, tool schemas, packaged skills, tests and the `@fission-ai/openspec` pin.
