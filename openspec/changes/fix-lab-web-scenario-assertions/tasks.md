# Tasks

## 1. Fail the run on a page error and keep a screenshot

- [ ] 1.1 Extract the page-event recording into `watchPage`, keeping page errors in a `pageErrors` list next to `errors` and `failures`.
- [ ] 1.2 Add `confirmPageLoaded`: throw when `pageErrors` is non-empty, otherwise screenshot to the given path and append it to the run's screenshot list.
- [ ] 1.3 Call it after `waitForShell` in `ensureWeb`, writing `artifacts/web.png`; append a scenario's `web.screenshot` path to the same list and write `screenshots` plus the page-event counts into `report.json`.

## 2. Make workspace selection strict

- [ ] 2.1 Throw in `chooseWorkspace` when the `Choose workspace` button, a path segment in the picker or the `Open` button is missing, naming what was not found.
- [ ] 2.2 Wait for the page to show the selected directory name and throw when it does not.

## 3. Cover the conditions with fake pages

- [ ] 3.1 Extend the fake page so a locator can report absence, and add a page that emits `console`, `pageerror` and `requestfailed` events.
- [ ] 3.2 Assert that a page error fails the open check and that a clean page records the screenshot path with the file present.
- [ ] 3.3 Assert the throws for a missing button, a missing path segment and a page that does not show the workspace, and the wait on the selected name.
- [ ] 3.4 Rename the `browserPresent` case to its real semantics; leave the function unchanged.

## 4. Update the documentation

- [ ] 4.1 Describe the open conditions, the automatic `artifacts/web.png`, the report's `screenshots` and the strict `chooseWorkspace` in `docs/lab.md`, and guard them in `test/lab-doc.test.mjs`.

## 5. Verify

- [ ] 5.1 Run `node --test test/lab-web-helpers.test.mjs test/lab-doc.test.mjs`.
- [ ] 5.2 Confirm the new assertions fail with the implementation reverted.
- [ ] 5.3 Run `/tmp/b3/gates.sh fix-lab-web-scenario-assertions`.
