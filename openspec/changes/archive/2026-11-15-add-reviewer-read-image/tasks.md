# Tasks

## 1. Preset and reviewer entry

- [x] 1.1 Enable `readImage` in the `openspec-reviewer` preset's `tool-fs` row in `cordis.patch.yml`; verify `readImage: true` sits beside `read: true` and `write: false`, and the preset test asserts it.
- [x] 1.2 Add `read_image` to `PRESET_TOOL_NAMES` in `reviewer.js` and update the module comment from six to seven tools; verify the preset tool-name test and a deny-set test that includes a global `read_image` keep it out of the deny names.

## 2. Documentation

- [x] 2.1 Update the reviewer section of `docs/review.md` to list `read_image` in the preset, the seven-tool composition with the conditional registration and the `attachments`/image-route prerequisites; extend `test/review-doc.test.mjs` with the seven names, the conditional catalog wording and the prerequisite phrase; verify the documentation tests pass.
- [x] 2.2 Update the reviewer paragraph in `README.md` (the seven names including `read_image`, plus the `attachments`/image-route prerequisites) and the `reviewer.js` and preset `tool-fs` rows of `docs/upgrading-dsh-runtime.md` (the `readImage` key, `ctx.attachments` and image modality); verify a README section-scoped check lists all seven names and the prerequisite sentence, and no document still claims an unconditional six-tool catalog.

## 3. Integration verification

- [x] 3.1 Run `npm test` on Node 24 and confirm the plugin suite passes, including the new preset and deny-set tests.
- [x] 3.2 Run `npm run coverage:check` and confirm the gate passes.
- [x] 3.3 Run `openspec_inspect` with `action: "validate"` and `strict: true` for this change and confirm no findings.
- [x] 3.4 Dump the composed `web` profile configuration (use a temporary `DSH_HOME` copy when the sandbox cannot write the live profile) and confirm the `preset-openspec-reviewer` entry carries `readImage: true` under `tool-fs`; verify the command exits 0 and the field appears in the preset.
- [x] 3.5 Review the final diff for unrelated changes; verify only the files named in the proposal and the change artifacts are modified.
- [x] 3.6 After the bundle reload, start a disposable `reviewers: 1` review and read the reviewer session's request header; verify `read_image` is present when the Host mounts `attachments`, and have the reviewer read a disposable small PNG generated for the check (not committed) to verify a successful image result; when the locked route is text-only, record the clean tool error instead.
- [x] 3.7 Verify the no-attachments variant through a temporary `DSH_HOME` profile that omits `attachment-local`; if the Host cannot omit the service, verify the pinned `dsh-tool-fs` registration contract (`read_image` registers only under `ctx.inject(['attachments'])`) plus the documentation test, and record which path was used.

## Workflow follow-up

- Commit the implementation after tasks and verification pass.
- Start the apply review; fix every blocker; keep the review until it is ready.
- Archive only when the user explicitly asks, then commit the archive, documentation updates and merged specs and push `main` to `origin`.
