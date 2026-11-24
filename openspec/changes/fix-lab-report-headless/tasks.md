# Tasks

## 1. Record the outcome

- [x] 1.1 Build the headless check from the driver result so it carries the exit status and the final reason next to its existing fields.
- [x] 1.2 Attach the run directory to a provisioning error and record it as `runDir` in that scenario's summary result.

## 2. Guard the report fields

- [x] 2.1 Assert the exit status and final reason of the headless check in `test/lab-headless.test.mjs`.
- [x] 2.2 Assert `runDir` on a provisioning failure's summary result in `test/lab-runner.test.mjs`.
- [x] 2.3 Confirm both assertions fail against the previous implementation.

## 3. Document the fields

- [x] 3.1 State the headless check fields and the failing result's run directory in `docs/lab.md`, and pin them in `test/lab-doc.test.mjs`.

## 4. Verify

- [x] 4.1 Run `node --test test/lab-headless.test.mjs test/lab-runner.test.mjs test/lab-doc.test.mjs`.
- [ ] 4.2 Run `/tmp/b3/gates.sh fix-lab-report-headless` and record the summary here.
