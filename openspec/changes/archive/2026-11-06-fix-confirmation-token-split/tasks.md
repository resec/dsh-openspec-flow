# Tasks

## 1. Step-level session detail

- [x] 1.1 Extend `summarizeSession` with per-turn step details (`step`, `usage`, `hasToolCall`) derived from assistant messages and `tool/call` events, and verify `node --test eval/test/eval-session.test.mjs` covers a turn with a text step followed by a tool step.
- [x] 1.2 Add a fixture-style test where a confirmation turn starts with a tool call and one where it starts with a text step, and verify both step lists are recorded in order.

## 2. Work and acknowledgment metrics

- [x] 2.1 Replace the whole-round `core` subtraction with `work = total - confirmationAck`, where acknowledgment is the steps before the first tool call, and verify `node --test eval/test/eval-metrics.test.mjs` covers zero-ack, nonzero-ack and no-confirmation cases.
- [x] 2.2 Rename the aggregate fields to work tokens and work ratio while keeping total tokens, and verify the metrics tests assert both medians and the comparison ratio.

## 3. Report and documentation

- [x] 3.1 Update the Markdown and JSON report to show total, work, confirmation-round and confirmation-ack tokens, and verify `node --test eval/test/eval-report.test.mjs` asserts every column.
- [x] 3.2 Document the step-level rule and the new fields in `eval/README.md`, and verify the documented names match the JSON report.

## 4. Validation

- [x] 4.1 Run `openspec_validate fix-confirmation-token-split` and `npm run test:all`, and verify both pass.
