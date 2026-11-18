# Proposal: refine-review-card-display

## Why

The collapsed review card reports `findings N（阻塞 M）`, so a reader must open the report to learn the severity mix, and the trailing `下一步 <action>` repeats an internal tool call that goes stale as soon as the user acts. In the expanded card, optional finding fields (`规则`, `失败路径`) and disposition fields (`豁免`, `批准者`) print `未记录`, adding rows that carry no information. The readiness section prints one row per finding, so three open findings become three near-identical lines and the shared cause is hard to see.

The existing `review-cards` collapsed-card requirement still requires the next action, the expanded-card requirement requires every finding field, and no requirement covers a severity breakdown or grouped readiness reasons.

## What Changes

- Collapsed summary: replace `findings N（阻塞 M）` with fixed-order counts `critical`, `major`, `minor`, `nit` over every recorded finding (the same set as the old total), and drop the ` · 下一步 <action>` segment. `处理汇报` cards use the same shape.
- Expanded finding rows: omit `规则` and `失败路径` when the value is null, undefined or empty; keep `问题`, `证据`, `影响`, `建议`.
- Expanded disposition rows: omit `豁免` and `批准者` when empty; keep `说明` and `验证轮次`.
- Readiness reasons: merge reasons of the form `finding <id> is <state>` or `blocking finding <id> is <state>` by blocking flag and state, listing IDs in first-seen order. One ID keeps the original sentence; several use `findings ... are ...`. Unmatched reasons stay unchanged, one per row.
- Docs and tests: update `docs/review.md`, the client test and the documentation test; no server, payload or schema change.

## Capabilities

### Modified Capabilities

- `review-cards`: the collapsed summary shows per-severity finding counts and no next action; the expanded card omits unrecorded optional rows and groups readiness reasons by kind.
- `review-documentation`: the card-surface description states the per-severity summary, the omission rule and the readiness grouping.

## Impact

- Client: `client.js` (`cardSummary`, `findingRows`, disposition rows and the readiness section).
- Tests: `test/review-client.test.mjs`, `test/review-doc.test.mjs`.
- Docs: `docs/review.md`.
- Specs: `review-cards` and `review-documentation` deltas.
- No host code, card payload, tool schema, review protocol, dependency or `dist/` change; existing card files render with the new rules.
