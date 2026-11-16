# Enforce finding dispositions before a review round advances

## Why

A review round can advance while its findings are still `open`. `openspec_review` with `action: "resume"` accepts a `dispositions` array but never consumes it, and it opens the next round without checking that the previous round's findings were disposed. In the `upgrade-openspec-cli-2-0-0` review this produced a contradictory record: the round-2 report could not mark `R1-01` as `verified-fixed` because the finding was still `open`, yet round 2 opened and its report was accepted. The reviewer then had no tool path to read the recorded finding state, so it read `openspec/.review/.../review.json` directly and inferred the rule from the plugin source.

The same hole lets a review spend its round budget without progress: `readiness.nextAction` says `dispose`, but nothing on the `resume` path enforces it.

## What Changes

- `openspec_review` `start` and `resume` reject a `dispositions` argument. Dispositions belong to `action: "dispose"` or a finding `action: "waive"`, which already share the atomic batch.
- `resume` refuses to open a new round while any recorded finding is `open`; the error names the open ids and points at `action=dispose`. The gate applies to draft and apply reviews and to both reviewer modes.
- The readiness next action names `action=dispose` whenever a finding is open, even when the object changed or another finding is fixed, so the tool never recommends a call the gate refuses.
- `openspec_reviewer` `read` gains `target: "findings"`, which returns finding statuses and a round summary; `target: "own-report"` honors `round` so a reviewer can read an earlier round's report.
- The `verified-fixed` refusal names the finding's current status and the changer's `action=dispose` step instead of only saying the finding is not fixed.
- The workflow skills state the order explicitly: fix, dispose, then resume; `dispositions` never travels with `resume`.
- `docs/review.md` and the README describe the reviewer read targets and the resume gate.
- Plugin version moves to 0.6.1. The installed copy is not repacked or reinstalled; the new behavior is verified by the source test suite.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: `start`/`resume` reject `dispositions`; `resume` requires every finding disposed before a new round; the `verified-fixed` refusal reports the current status and the disposition action.
- `tool-surface`: the reviewer tool exposes `findings` and an `own-report` round selector, and the review next action names `dispose` while a finding is open.
- `review-documentation`: the review document describes the reviewer read targets and the resume gate.
- `skill-adaptation`: the propose and apply skills state the fix, dispose, then resume order and the disposition ownership.

## Impact

- `lib/tools/review.js`: `start`/`resume` argument checks and the resume disposition gate.
- `lib/review/readiness.js`: `dispose` takes precedence over `resume` while a finding is open.
- `lib/review/report.js`: the `verified-fixed` refusal message.
- `lib/review/reviewer-tool.js`: `findings` target and `own-report` round handling.
- `test/review-draft.test.mjs`, `test/review-apply.test.mjs`, `test/review-reviewer.test.mjs`, `test/review-unit.test.mjs`, `test/review-wait.test.mjs`, `test/review-doc.test.mjs`, `test/skills.test.mjs`: regression coverage, including the existing cap and wake cases that now dispose first.
- `skills/openspec-propose/SKILL.md`, `skills/openspec-apply-change/SKILL.md`: dispose-then-resume wording.
- `docs/review.md`, `README.md`: reviewer read targets and resume gate.
- `package.json`, `package-lock.json`, `docs/upgrading-openspec-cli.md`: version 0.6.1.
- The profile currently installs 0.6.0; no `dist/` update and no profile reinstall in this change, so 0.6.1 is verified by the source suite.
