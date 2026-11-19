# Proposal: Refine review card visibility

## Why

In an independent review the changer calls `wait`, and `wait` (with `report` as a fallback) writes a review card into the changer session. The reviewer session already has the submitted review card, so the same report is shown twice and the changer session keeps a card the user does not want. The existing `review-cards` requirement makes that duplicate card mandatory.

The collapsed card also omits the change name. Several changes may hold draft reviews at the same time, so `评审汇报 · draft · 第 2 轮 · …` does not identify which change the round belongs to.

## What Changes

- Stop writing review cards from the changer's `wait` and `report`. A review card is written only by the session that submits the report: `self-report` for a self review and reviewer `submit` for an independent review. The resolution card keeps its current write points.
- In `reviewCards/get`, withhold `phase: "review"` cards for the changer session of an independent review, including cards written before this rule, and do not bind them. Self reviews, reviewer sessions, and a missing or unreadable record keep the current delivery. The card's recorded `review` kind selects the draft or apply record the rule compares against.
- Remove the `wait` card-marker write from the `change-review` specification; it currently mandates the write this change deletes.
- Align the shipped propose and apply skills: an independent review reports only in the reviewer session, and a self review reports in the changer session.
- Prefix the collapsed summary with the recorded change name before the review kind; omit the segment when the name is absent or empty.
- Update tests, `docs/review.md` and `README.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-cards`: the review card belongs to the reporting session, and the Host withholds the changer's review card in an independent review; the binding and legacy-card requirements gain that exception; the collapsed summary names the change.
- `change-review`: the `wait` requirement drops the card-marker write and its contention scenario.
- `review-documentation`: the review document describes the review-card writers, the changer-session visibility rule, and the change name in the summary.

## Impact

- `lib/tools/review.js`: remove the card writes in `waitReview` and `readReport`.
- `lib/review/settings.js`: filter review cards at delivery using the review record selected by the card's review kind.
- `client.js`: change the collapsed summary.
- Skills: `skills/openspec-propose/SKILL.md`, `skills/openspec-apply-change/SKILL.md`.
- Tests: `test/review-cards-flow.test.mjs`, `test/review-cards-endpoint.test.mjs`, `test/review-client.test.mjs`, `test/review-doc.test.mjs`, `test/skills.test.mjs`.
- Docs: `docs/review.md`, `README.md`.
- No dependency, schema, record-format or card-file-layout change. Existing card files stay in place; the Host filters them at delivery. No data migration.
