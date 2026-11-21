# Tasks

## 1. Convention text

- [x] 1.1 Add the `Commit conventions` section to `AGENTS.md` and cross-reference it from step 6, stating that a finding-scoped commit answers at most one finding with rework allowed, that review-local identifiers stay out of git, that a finding's substance is restated, that the seal covers identifiers only, and that the maintainer reads `git log <base>..HEAD` before resuming a round and before land; verify with `git diff -- AGENTS.md` that the section and the cross-reference are the only changes.
- [x] 1.2 Check that the section, the two `development-workflow` requirements and the unchanged generic apply texts agree; verify by reading them side by side and running `npm run openspec:check`.

## 2. Validation and verification

- [x] 2.1 Run `openspec_inspect` with `action: "validate"` and `strict: true` for this change; verify it reports no finding.
- [ ] 2.2 Run `npm run verify` with a Node 24 runtime on `PATH` that satisfies `engines.node` (activate one as `docs/upgrading-openspec-cli.md` describes); verify it exits zero and reports both the test summary and the coverage verdict.

## Workflow follow-up

- Apply the change; the plugin seals the draft on the apply branch, so the change directory stays uncommitted until then.
- Run the apply review on the committed worktree and answer every finding with its own commit; the rework of an overturned finding is a further commit for the same finding.
- Land and push through the documented land path.
