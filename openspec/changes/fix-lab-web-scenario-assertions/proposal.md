# Proposal

## Why

The lab-harness spec states three pass conditions for the Web GUI that the driver never enforced. It says the page loads "without an uncaught page error" and that "the report keeps a screenshot" (`lab-harness/spec.md`, "The Web GUI opens"), and it says the driver selects the scenario's project directory and the page shows that workspace before a message is sent ("A workspace is selected"). The implementation collects console errors, page errors and failed requests into arrays nothing reads; a screenshot exists only when a scenario calls `web.screenshot` itself and the report has no screenshot entry; and `chooseWorkspace` returns silently when the `Choose workspace` button is absent and skips any path segment the dialog does not show. A page that never renders a shell, or a picker that never selects the project, still passes the smoke scenario.

## What Changes

- Move the page-event recording into an exported `watchPage`, keep page errors in their own list and fail the run when the loaded page recorded one, naming the error the page raised.
- Enforce the open conditions in one driver step: `confirmPageLoaded` fails on a recorded page error, otherwise screenshots the page to `artifacts/web.png` and appends that path to the report's `screenshots`. A scenario's own `web.screenshot` call records its path too, so every screenshot in the run is listed with the path it was written to.
- Record the counts of console errors, page errors and failed requests in the report. The contents stay out: a failed request URL can carry the startup token, which the report must not contain.
- Make `chooseWorkspace` drive the picker by the exact absolute path through its `Edit path` editor instead of walking from `Home`, then assert the picker's breadcrumb names the directory, that `Open` closes the picker and that the workspace chip no longer shows the `Choose workspace` placeholder. Throw when the page offers no `Choose workspace` button, no path editor, no `Open` button, or when any of those assertions fails.
- Cover the three conditions with fake pages: a page error fails the run, the screenshot path reaches the report and the file exists, and a missing control or an unadopted workspace throws. Rename the `browserPresent` case to the behaviour it asserts; the function itself is unchanged, since F15 may remove it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `lab-harness` already requires all three behaviours in "The lab drives headless and Web GUI surfaces"; only the driver was missing the assertions, so this change sets `skip_specs: true`.

## Impact

- `scripts/lab/drivers/web.mjs`: page-event recording, the open-page check, strict workspace selection.
- `scripts/lab/index.mjs`: call the open-page check, keep `artifacts/web.png`, record screenshot paths and page-event counts in the report.
- `test/lab-web-helpers.test.mjs`: fake pages with absent controls, the page-error case, the screenshot record.
- `docs/lab.md` and its guard `test/lab-doc.test.mjs`.
- No dependency, workflow, hook, spec or `dist/` change. No real browser is started by the tests.
