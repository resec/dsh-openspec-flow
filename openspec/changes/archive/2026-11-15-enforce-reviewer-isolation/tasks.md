# Tasks

## 1. Reviewer catalog restriction

- [x] 1.1 Compute the global Host tool names with `ctx.tools.definitions()`, exclude the six preset names, and register `ctx.tools.restrict({ deny: names })` in `reviewer.js`; in the `tools/change` refresh add new names to the denied `Set` before calling `restrict` and remove them in a catch when it throws; fail the activation when the initial restriction throws; verify a fake-context `apply` records the deny names without the preset tools.
- [x] 1.2 Extend `test/fake-context.mjs` with `tools.definitions`, `tools.restrict` and `tools/change` support, then add `test/review.test.mjs` regressions for the deny set, the preset-name exclusion (including a global `read`), the refresh of a newly registered Host tool, the refresh-failure warning that keeps the earlier deny set and is retried by a later `tools/change`, and the fail-closed initial throw; verify the focused reviewer-entry tests pass.
- [x] 1.3 Extend the preset/catalog test to assert the reviewer entry denies the global names while the changer entry does not; verify the test fails if the restriction call is removed.
- [x] 1.4 Update the reviewer section of `docs/review.md` and `README.md` to state the six-tool effective catalog, the by-name deny and the registry refresh; add the phrases to `test/review-doc.test.mjs`; verify the documentation test passes.
- [x] 1.5 Update the DSH coupling inventory in `docs/upgrading-dsh-runtime.md` with `dsh-tools` `restrict`/`definitions`/`ToolRestriction` and the `dsh-scope` parent-chain binding, and note the `test/fake-context.mjs` stand-in; verify the table names each symbol and the new `reviewer.js` call site.
- [x] 1.6 Run a disposable Node contract check against the pinned DSH: register a global tool and a scoped tool under a parent scope, apply a deny restriction at the parent, and assert the child sees the scoped tool and not the global one; record the command and output. Stop if the observed catalog is not the expected one.

## 2. Apply review strict validation

- [x] 2.1 Add a strict option to `validateChange` that passes `--strict`, keeps the draft call non-strict, and throws the projected issues with an apply-review diagnostic; verify a test captures the CLI argv and asserts the flag on the apply path only.
- [x] 2.2 Run strict validation from `applyReviewEntry` for both `start` and `resume` before the record or round is written; verify a strict-warning fixture refuses the entry with its issues and leaves no record, and a clean fixture opens the round.
- [x] 2.3 Pass the validation result into `buildApplyBrief`, add the host-validation header line and reword the archive-readiness axis so the reviewer is not asked to validate; verify a brief test asserts the line and the absence of a reviewer validation instruction.
- [x] 2.4 Update the apply-review section of `docs/review.md` and `README.md` to state that start and resume run strict validation and the brief carries the result; extend `test/review-doc.test.mjs`; verify the documentation test passes.

## 3. Integration verification

- [x] 3.1 Run `npm test` on Node 24 and `npm run coverage:check`; fix every failure; verify both commands pass.
- [x] 3.2 Run `openspec_inspect` with `action: "validate"` and `strict: true` for this change; verify it reports no findings.
- [x] 3.3 After the Host reload, start a disposable reviewer on a temporary change and read its `request/header`; verify it contains only `read`, `grep`, `glob`, `web_search`, `web_fetch` and `openspec_reviewer`, and that a hidden Tool call fails as unknown.
- [x] 3.4 Review the final diff for unrelated changes; verify only the files named in the proposal and the change artifacts are modified.

## Workflow follow-up

- Commit the implementation after tasks and verification pass.
- Start the apply review; fix every blocker; keep the review until it is ready.
- Archive only when the user explicitly asks.
