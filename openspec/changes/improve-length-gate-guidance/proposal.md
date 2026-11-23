# Make the length gate failure actionable

## Why

The length gate now runs in pull-request CI, but its failure output is one annotation per entry and a `requirement length gate: failed` line. The annotation names the delta file and line as workflow-command properties, yet it carries no rationale, no official handling and no command that verifies a fix; the handling is written only to the job summary, which the author has to open separately. A contributor who sees the red check cannot act on it without reading the plugin sources or asking the maintainer.

The failure is also the only feedback for this class of defect: once the gate fails, the change does not enter the review watch, so no comment carries the explanation.

## What Changes

- Print the full failure report to the job log, not only to the job summary: why the 500-character limit exists, the blocking entries and their lengths, the official handling, the delta file and requirement line to edit, and the local verification command.
- Keep the same report in the job summary and keep the file annotation that points at the delta spec.
- Document in `docs/pr-review.md` where the author sees the report.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contributor-workflow`: the existing reporting requirement is extended so a failing length gate writes the same actionable report to the job summary and the job log, states why the limit exists, names the edit location and the local verification command, and degrades to the file alone when the heading is missing. The requirement body stays under the 500-character limit, so it is modified rather than split.

## Impact

- Changed code: `scripts/check-requirement-length.mjs` (report rendering and log output), `test/check-requirement-length.test.mjs` (report assertions).
- Changed documentation: `docs/pr-review.md`.
- No change to CI wiring, the classifier, the npm script name, the exit codes or the annotation format.
