# Add review resume action

## Why

`openspec_review` uses `start` for both the first round and every later round. That makes `start` ambiguous: it must carry the draft intent on every call, it rewrites `intent.md` after the review already bound the previous text, and an agent that finished a round has no action that means "continue the started review". The propose and apply skills only describe the first start, so later rounds are easy to call incorrectly.

## What Changes

- Add `resume` to `openspec_review` for draft and apply reviews. It continues a recorded review and takes no intent argument.
- **BREAKING**: `start` only starts a review whose record does not exist. When a record exists, `start` fails and names `resume`.
- **BREAKING**: `resume` refuses a draft or apply review with no record and names `start`.
- Draft `start` writes `intent.md` once. Draft `resume` reads it for the object hash and never rewrites it, so the reviewed intent is stable across rounds.
- `resume` opens a new round when the latest round has a report, reuses an unreported round, returns the brief when the review already passed on the same object, and refuses an abandoned review.
- `resume` wakes the existing reviewer only when it opens a new round; resuming an unreported round leaves the reviewer alone.
- Status output, readiness next actions, gate errors and tool descriptions name `start` for the first round and `resume` for later rounds.
- Update the propose and apply skills, README, `docs/review.md`, the flow rule and the repository instructions to use `resume` after the first round.

## Capabilities

### Modified Capabilities

- `change-review`: `start` becomes first-round only; a new requirement covers `resume`, the read-only draft intent and the round and reviewer behavior.
- `tool-surface`: `openspec_review` exposes `resume` for draft and apply reviews; the action errors name the other action; the next-action fields distinguish the first round from later rounds.
- `skill-adaptation`: the propose and apply skills use `resume` for later rounds.

## Impact

- `lib/tools/review.js`: action set, dispatch, the `start` guard, the `resume` entry and next-action text.
- `lib/review/readiness.js` and the apply gate errors: next actions name `resume` once a record exists.
- `skills/openspec-propose/SKILL.md`, `skills/openspec-apply-change/SKILL.md`, `lib/policy.js`, `AGENTS.md`, `README.md`, `docs/review.md`.
- Tests: existing repeated `start` calls move to `resume`; new regressions cover both refusals, the unmodified `intent.md` and the reviewer wake-up rule.
- No dependency, configuration, record-schema or CLI change.
