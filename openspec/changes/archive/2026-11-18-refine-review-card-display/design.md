# Design: refine-review-card-display

## Context

See `proposal.md`. The card payload already carries every recorded finding (with `severity`) and every readiness reason as a string; the collapsed summary, the optional rows and the readiness section are all rendered in `client.js`, a hand-written loader bundle with no build step. The Host writes the payload once and serves it unchanged, so any display rule implemented in the client applies to existing card files after a refresh.

The two existing `review-cards` requirements that change are the collapsed summary and the expanded report; the readiness section is currently rendered but not specified. `docs/review.md` describes the card surface and is checked by `test/review-doc.test.mjs`.

## Goals / Non-Goals

Goals:

- Keep the change inside the client renderer, the client test, the documentation test and `docs/review.md`.
- Make the summary, row omission and readiness grouping deterministic for any card payload, including older card files.
- Keep the exact readiness strings in the payload and in tool results.

Non-Goals:

- No change to `draftReadiness`, its reason wording, the card payload, the card write points or the review protocol.
- No translation of report or readiness prose; section labels stay fixed Chinese, severity names stay the recorded tokens.
- No change to the `影响` row, the expanded `下一步` metadata row or the plan-change waiver section.
- No new dependency and no build step.

## Decisions

### Derive severity counts in the client

`cardSummary` counts `card.findings` by severity in the fixed order `critical`, `major`, `minor`, `nit`. The card payload already carries the recorded findings, and they are the same set `counts.total` is computed from, so the four counts sum to the old total without a Host change. A missing or non-array `findings` value yields zero counts; an unknown severity is ignored.

Alternative considered: add a `bySeverity` object to `counts` in `buildCard`. That would touch `summarizeFindings`, whose output is constrained by `FINDING_SUMMARY_SCHEMA` (`additionalProperties: false`) in the tool output, and would grow the payload for a value the client can derive. Rejected.

### Hide unrecorded optional rows at render time

A single helper treats `null`, `undefined` and `''` as unrecorded and returns no row. It is applied to `规则` and `失败路径` in `findingRows` and to `豁免` and `批准者` in the disposition rows. Required fields (`问题`, `证据`, `建议`) and the always-rendered `说明`/`验证轮次` keep the existing `未记录` fallback.

Alternative considered: omit the empty fields when building the card. Rejected: the payload is documented as lossless and is also the debugging source; display policy belongs to the renderer.

### Group readiness reasons in the client

The readiness section parses reasons matching `finding <id> is <state>` with an optional `blocking ` prefix, groups by the blocking flag plus the state text, and preserves the first-seen order of groups. A single id keeps the original sentence; several render as `findings <ids> are <state>`, with `blocking ` prefixed for a blocking group. Reasons that do not match render unchanged, so the parser can only degrade to the current one-line-per-reason display, never drop a reason.

Alternative considered: return structured reason groups from `draftReadiness`. That would change the shape consumed by tool results, records and their tests, and the card already has the strings. Rejected for this display-only change; the parser is the explicit coupling point if the reason wording changes.

The summary no longer renders `card.nextAction`; the expanded metadata row keeps it, so the payload and the tool-facing next action are unchanged.

## Risks / Trade-offs

- [Readiness wording drift breaks grouping] → The parser has a per-line fallback, the client test covers the documented forms, and the function documents that `lib/review/readiness.js` owns the input shape.
- [Severity counts include closed findings] → This matches the old `total` and the spec states it; a reader who wants open-only counts is out of scope for this change.
- [English severity names on a Chinese-labelled card] → Severity tokens are recorded data, not UI labels; the fixed-Chinese requirement continues to govern section labels and controls.
- [Old cards with a missing `findings` array show zero counts] → Cards are produced by `buildCard`, which always writes the array; a malformed card already degrades to the no-card path at the endpoint.

## Migration Plan

No data migration. After the client is rebuilt or the plugin is reinstalled, existing bound cards render with the new summary and row rules on the next page load. Rollback is a client-only revert; card files, records and tool results are untouched.

## Open Questions

None.
