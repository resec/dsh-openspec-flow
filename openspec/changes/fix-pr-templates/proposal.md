# Proposal

## Why

The contribution templates are the first instruction a contributor reads, but no test reads them. The pull request template still says a pull request "adds or updates an active change" while `scripts/check-pr-change.mjs` requires exactly one, and none of the three templates names `npm run check:requirement-length`, which the CI verify job runs. A contributor who follows the template therefore misses a gate and can believe the checklist is complete.

## What Changes

- State exactly one active change in the pull request template, and keep the six body sections the repository actually uses (`Linked issue`, `Change`, `Root cause`, `Scope`, `Evidence`, `Risk and rollback`), dropping the checklist and agent metadata blocks.
- Add `npm run check:requirement-length` to the self-check command list of the pull request template and both issue templates, matching CONTRIBUTING.
- Add `test/templates.test.mjs`: the three templates exist, the pull request template keeps the six sections and the exactly-one wording, the command lists carry `check:requirement-length`, and every `npm run <script>` a template names is defined in `package.json`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

`contributor-workflow` gains one requirement: the test suite reads the templates and fails when they drift from the gates. The existing requirement already fixes the template content, but nothing requires a test to read it.

## Impact

- `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/bug.md`, `.github/ISSUE_TEMPLATE/task.md`.
- `test/templates.test.mjs`.
- No workflow, hook, dependency, `dist/`, archive, baseline or lockfile change.
