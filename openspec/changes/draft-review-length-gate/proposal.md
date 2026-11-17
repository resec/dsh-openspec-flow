# Proposal: draft-review-length-gate

## Why

The bundled OpenSpec 2.0.0 validator still checks only ADDED requirement descriptions during change validation. A MODIFIED description can grow past 500 characters while `openspec validate <change> --strict` reports no issue; the warning appears only on the main spec after archive.

The official handling is not to compress the text. A requirement keeps one behavior, examples and edge cases move into scenarios, and an existing long requirement is split only in a user-requested dedicated change that preserves its header and scenarios and adds the removed behaviors as ADDED requirements. Draft review is the last plan-stage gate, so it should apply that rule before apply starts.

## What Changes

- Add a host length preflight to draft review start and resume. It reads the delta requirements and the related main specs through the bundled CLI's `show` output.
- Classify ADDED descriptions over 500 characters and MODIFIED descriptions over 500 characters that are longer than their main-spec baseline as blocking. Leave unchanged or shortened legacy descriptions unblocked.
- Add a `## Requirement length` section to the draft brief with the measured lengths and the official handling: do not compress, split one behavior per requirement, move detail into scenarios, and use a dedicated change for an existing long requirement.
- Record the result on the draft record. `draftReadiness` refuses readiness while a blocking result is recorded, and the next action names `openspec_review` with `action: "resume"` and `review: "draft"`, not `dispose`, because no finding exists.
- Recheck the length at the first apply entry, and at apply review start or resume when apply review is enabled and available, so a later plan edit or a changed main-spec baseline cannot bypass the gate. After apply starts, the frozen draft no longer gates on the length result; apply review owns that recheck. A project that disables or cannot run apply review has no post-apply length gate.
- Update the propose skill's not-ready branch: when only the length gate blocks and no finding is open, edit the artifacts and resume without disposing.
- Document the gate and the handling in `docs/review.md`, the README review section and the propose skill.
- Keep the review record schema additive: a legacy record without the new measurement remains readable and is checked at its first apply entry; resuming records the result.

No automatic rewrite, truncation or compression is added.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: the draft review gains a requirement-description length preflight, a recorded result, a readiness gate and the official handling in the brief.
- `review-documentation`: the review document and README state the gate, the blocking rule and the no-compression guidance.
- `tool-surface`: the next action for a length-only block names draft resume, not dispose.
- `skill-adaptation`: the propose skill resumes a length-only block without disposing a finding.

## Impact

- New `lib/review/length.js`: classification, official guidance text and the brief section renderer.
- `lib/tools/review.js`: load the delta and main-spec data, store the report at draft start and resume, recheck at apply entry and apply review entry.
- `lib/review/brief.js`: build the `## Requirement length` section.
- `lib/review/readiness.js`: include a recorded blocking result in the readiness reasons and return draft resume as the next action for that state.
- Tests: `test/review-length.test.mjs`, `test/review-unit.test.mjs`, `test/review-draft.test.mjs`, `test/review-apply.test.mjs`, `test/review-doc.test.mjs` and the skill tests.
- Documentation: `docs/review.md`, the README review section and `skills/openspec-propose/SKILL.md`.
- No tool name, tool parameter or review record file name changes.
