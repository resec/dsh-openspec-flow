# Add the requirement length gate to pull-request CI

## Why

The bundled OpenSpec CLI reports an ADDED requirement description over 500 characters as a warning during change validation, but it leaves MODIFIED descriptions alone, because their text is the existing requirement. A MODIFIED description that grows past the limit is therefore invisible to `npm run openspec:check`, and the first refusal happens inside the plugin's apply preflight, after the pull request has a green CI run.

That ordering has two costs. The author learns about the defect only through a review attempt that cannot start, and the scheduled review watch keeps selecting the pull request because its CI is green, then refuses the round again on every run. Two open pull requests are currently blocked this way, with merged lengths of 555 against a 221 baseline and 533 against a 487 baseline.

CI already runs strict artifact validation on every pull request. Running the same growth check there reports the defect at the pull request, and because the watch only selects pull requests whose checks all succeed, a failed gate removes the pull request from the review candidates instead of repeating a refusal.

## What Changes

- Add `scripts/check-requirement-length.mjs`, which reads each active change's delta and the related main-spec requirements and applies the existing review classifier.
- Add a `check:requirement-length` npm script and run it in the verify job after `npm run openspec:check`.
- Report blocking entries and the official handling in the job summary and as file annotations, and exit nonzero.
- Document the gate in `docs/pr-review.md`, `CONTRIBUTING.md` and `AGENTS.md`; the contributor document gains the local command and the updated CI step list.
- Keep the plugin's apply preflight unchanged; CI is an earlier execution of the same rule, not a replacement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contributor-workflow`: new requirements state that pull-request CI runs the requirement-description length gate, that strict validation reports an over-long added description before the gate runs, that a direct run still covers added descriptions, and that a failing gate reports each blocking entry and the official handling and fails closed. The existing CI job requirement keeps its text; the new behavior is added as its own requirements because that requirement's description is already over the limit and must not grow.

## Impact

- New code: `scripts/check-requirement-length.mjs`, `test/check-requirement-length.test.mjs`.
- Changed files: `.github/workflows/ci.yml` (one step), `package.json` (one script), `test/ci-workflow.test.mjs` (one assertion), `docs/pr-review.md`, `CONTRIBUTING.md`, `AGENTS.md`.
- Reused code: `lib/review/length.js` `classifyRequirementLength` and `OFFICIAL_LENGTH_HANDLING`, and `lib/openspec.js` `resolveBundledCli`; the script runs the bundled CLI the same way the plugin does.
- No change to the plugin tool surface, review records, or the watch script.
- The gate makes a blocked pull request fail CI, which already removes it from the watch candidates; no watch change is needed.
