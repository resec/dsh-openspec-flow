# Tasks

## 1. Fail the run on a page error and keep a screenshot

- [x] 1.1 Extract the page-event recording into `watchPage`, keeping page errors in a `pageErrors` list next to `errors` and `failures`.
- [x] 1.2 Add `confirmPageLoaded`: throw when `pageErrors` is non-empty, otherwise screenshot to the given path and append it to the run's screenshot list.
- [x] 1.3 Call it after `waitForShell` in `ensureWeb`, writing `artifacts/web.png`; append a scenario's `web.screenshot` path to the same list and write `screenshots` plus the page-event counts into `report.json`.

## 2. Make workspace selection strict

- [x] 2.1 Enter the scenario's absolute directory through the picker's `Edit path` editor instead of walking from `Home`, which only worked when the picker happened to open at the project level.
- [x] 2.2 Assert the picker's breadcrumb names that directory, that `Open` closes the picker and that the workspace chip no longer shows the `Choose workspace` placeholder; throw with what was not found when the page offers no button, no path editor or no adoption.

## 3. Cover the conditions with fake pages

- [x] 3.1 Extend the fake page so a locator can report absence, and add a page that emits `console`, `pageerror` and `requestfailed` events.
- [x] 3.2 Assert that a page error fails the open check and that a clean page records the screenshot path with the file present.
- [x] 3.3 Assert the throws for a missing button, a missing path editor, an unentered directory, an unrenamed breadcrumb, a picker that stays open and a workspace that is not adopted.
- [x] 3.4 Rename the `browserPresent` case to its real semantics; leave the function unchanged.

## 4. Update the documentation

- [x] 4.1 Describe the open conditions, the automatic `artifacts/web.png`, the report's `screenshots` and the strict `chooseWorkspace` in `docs/lab.md`, and guard them in `test/lab-doc.test.mjs`.

## 5. Verify

- [x] 5.1 Run `node --test test/lab-web-helpers.test.mjs test/lab-doc.test.mjs`.
- [x] 5.2 Confirm the new assertions fail with the implementation reverted.
- [x] 5.3 Run `/tmp/b3/gates.sh fix-lab-web-scenario-assertions`; strict validation, `openspec:check`, the requirement-length gate, generated skills, `check:pr` and `npm run verify` pass.
