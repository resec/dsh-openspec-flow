# Proposal: enforce-disposition-target

## Why

A finding disposition defaults its `review` argument to `draft`. The draft and apply records both name their first-round findings `R1-01`…`R1-<nn>`, so a `dispose` call that omits `review` while the apply review is open matches the draft record instead: it overwrites verified draft findings with `fixed` and deletes their verification round. That happened in this repository: while disposing `add-review-round-cards` apply round 1, six verified draft findings were overwritten, and only the readiness drop revealed it. The tool result echoed `"review":"draft"` after the write, not before.

The draft record is documented and implemented as frozen once apply started: `start` and `resume` refuse it, and the policy text calls it frozen. `dispose` and a finding `waive` still wrote to it, so the freeze had a hole at the one place that mutates findings. The freeze is also weaker than stated: the first apply records its base commit outside the review lock, so a concurrent disposition can erase it and reopen the hole.

## What Changes

- `openspec_review` with `action: "dispose"` or a finding `action: "waive"` SHALL require `review: "draft"` or `review: "apply"`. A call that omits it SHALL fail before any record is read or written, and the error SHALL name the parameter and both values. **BREAKING** for a caller that relied on the draft default.
- After apply started, a draft `dispose` or draft finding `waive` SHALL fail and leave the record unchanged, naming the apply review status. Apply dispositions and the plan-change `waive` keep their behavior.
- The seal write that records the apply base SHALL run under the review lock with a fresh read, so a concurrent disposition cannot erase the base and reopen the freeze.
- Every next action and every verification refusal that names `action=dispose` SHALL carry the review kind, so the guidance the tool returns is itself a valid call.
- Both shipped review skills SHALL name the review kind at every `openspec_review` call in their review sections: the apply skill for `review: "apply"`, the propose skill for `review: "draft"`. The packaged-skill test SHALL reject an unqualified call in either section.
- `docs/review.md` and the README SHALL state the explicit kind and the draft freeze, SHALL show every dispose example with its kind, and SHALL name the kind-qualified next action.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `change-review`: two added requirements — dispositions name their review kind, and a started apply freezes draft dispositions — plus the modified verification-refusal requirement whose message now names the kind. Scenarios cover a missing kind, a draft batch, an apply batch, a frozen draft record, a still-accepted plan-change waiver and the qualified refusal.
- `tool-surface`: the disposition requirement gains the mandatory `review` parameter, and the next-action requirement carries the kind on `dispose`.
- `skill-adaptation`: both shipped review skills name the review kind at every call in their review sections, and the skill test enforces it for both.
- `review-documentation`: the batch disposition requirement states the explicit kind, the freeze, and that every example and the stated next action carry the kind; an added README requirement states the kind, the freeze and the qualified next action.

## Impact

- `lib/tools/review.js`, `lib/review/readiness.js`, `lib/review/report.js`, `lib/review/submit.js`, `lib/review/reviewer-tool.js`
- `skills/openspec-propose/SKILL.md`, `skills/openspec-apply-change/SKILL.md`
- `test/review-draft.test.mjs`, `test/review-apply.test.mjs`, `test/review-wait.test.mjs`, `test/review-cards-flow.test.mjs`, `test/review-reviewer.test.mjs`, `test/review-unit.test.mjs`, `test/skills.test.mjs`, `test/review-doc.test.mjs`
- `docs/review.md`, `README.md`
- No record format or readiness rule change: records keep their shape and their states.
