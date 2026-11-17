# Design: clarify-apply-brief-base

## Context

See `proposal.md` — Why.

`applyReviewEntry` resolves the base from an explicit `base`, the draft record's `applyBaseCommit`, or `git merge-base HEAD origin/main` (`lib/tools/review.js:856-865`). It passes `commitSha`, `treeSha`, `baseTreeSha`, the diff path and the changed paths to `buildApplyBrief` (`lib/tools/review.js:965-977`). The brief lists the commit, tree, base tree and diff, and its rules already say to review the diff against the base tree and the whole current tree, but the base reference, its source and the empty-diff case are not named.

The `openspec_review` parameter schema uses `additionalProperties: false` and does not declare `base`, although the entry point reads `args.base`. Tests call `tool.execute` directly, so they exercise the argument without the registered schema.

## Goals / Non-Goals

**Goals**

- Name the base reference and one of three sources in every apply brief.
- Make the explicit source reachable by declaring the already-read `base` parameter.
- State the diff scope and empty-diff meaning in a fixed section.
- Keep the document and the specs in sync.

**Non-Goals**

- No start refusal, status change, readiness or archive gate.
- No change to the base, tree or diff computation or to review records.
- No tool-schema change beyond declaring the existing `base` argument.

## Decisions

### D1: Compute the source next to the base resolution

Add `baseSource` in `applyReviewEntry` from the trimmed `explicitBase`: `explicit` when it is defined, `seal` when the draft record carries `applyBaseCommit` and no explicit base is set, `merge-base` otherwise. Deriving from `explicitBase`, not raw `args.base`, keeps a blank value from being labeled explicit. The value may be a commit, branch or tag reference; the brief prints the reference used and the diff resolves its tree. Pass `baseCommit` and `baseSource` to `buildApplyBrief`.

Why not infer the source in the brief: the brief does not receive the draft record or the arguments, and duplicating the resolution would drift.

### D2: Declare base in the registered schema

Add an optional `base` string to the `openspec_review` parameter schema, with the description `Apply review base commit or revision; defaults to the recorded apply base or git merge-base HEAD origin/main.` Apply `start` and `resume` use it; other actions ignore it; it is optional and not listed in `required`. The entry point already reads it; declaring it makes the explicit source reachable and keeps the three-source contract honest. A blank value is ignored by the existing trim, so it falls back to the seal record or the merge base.

Alternative considered: drop the explicit source and keep two labels. Rejected because the user asked for three exact labels. Adding the parameter is the minimal contract change that preserves that decision.

### D3: Add a dedicated section before Changed paths

The header gains `- base: <reference>`. A `## Base and diff` section has five bullets: the source sentence, the diff scope, the whole committed tree, the empty-diff meaning, and the instruction to check every task and delta requirement against the tree. The section precedes `## Changed paths` so the scope is read before the path list. Only the diff/base-tree sentence in the existing Rules bullet is replaced with a pointer to the section; the plan-change sentence in that bullet is kept, and the section is the single normative statement for the diff scope.

### D4: Brief-only, no gate

The user selected the brief optimization only. This change does not refuse an empty-diff start; that behavior was evaluated separately and deferred because of its workflow side effects. The schema declaration is not a gate: it exposes an argument the entry point already reads.

### D5: Tests use the existing fixtures

No fixture change. The existing `passDraft` path seals and starts with `HEAD` equal to the seal commit, so the start test already produces an empty diff and can assert the warning and the empty `diff.patch`. Unit tests cover the three source labels in the brief; integration tests cover the seal, explicit, merge-base and blank-base branches in `applyReviewEntry`. A catalog test asserts the schema declares an optional string `base` with a description, and a non-apply action ignores it.

### D6: Include review-documentation and tool-surface

`docs/review.md` is the single user-facing description of the review system, and the `review-documentation` capability exists to keep it aligned. The document gains one sentence, and the capability gains two requirements and scenarios: one for the `docs/review.md` sentence and one for the README `openspec_review` row. The row gains the optional `base`, and the document test asserts both statements. `tool-surface` gains one requirement and four scenarios for the parameter. No `flow-policy` or `skill-adaptation` change: no flow rule or skill behavior changes.

## Risks / Trade-offs

- [The schema change is a tool-contract change] → It only declares an argument the code already reads; a blank value keeps the old fallback behavior. Test the schema and the blank case.
- [Brief length and token cost] → Keep the section to five short bullets; it is read once per round.
- [Reviewer may still ignore the text] → This change is informational; a gate can be added later if needed.
- [Source label drifts from base resolution] → Derive it from `explicitBase` in the same block and test all three branches.
- [Document and spec drift] → The `review-documentation` requirement and the document test pin the sentence.

## Migration Plan

Clients that do not pass `base` keep the current behavior. A client that passes `base` now reaches the existing resolution instead of a schema rejection. A blank or whitespace-only value is ignored. Briefs are regenerated per round; review records, policies and readiness do not change. Rolling back is reverting the commit.

## Open Questions

None.
