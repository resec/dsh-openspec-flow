# Add the reviewer image read tool

## Why

The `openspec-reviewer` preset currently exposes `read`, `grep`, `glob`, `web_search`, `web_fetch` and `openspec_reviewer`, and its `tool-fs` row sets `readImage: false`. A draft brief can cite a screenshot, diagram or rendered preview, and an apply diff can add or change image files, but the reviewer can only read text. Those reviews are blind to the visual evidence the change is judged on.

## What Changes

- Enable `readImage` in the reviewer preset's `tool-fs` row so the reviewer composes `read_image` beside `read`.
- Add `read_image` to `PRESET_TOOL_NAMES` in `reviewer.js`, so the deny mask leaves the preset's own tool visible instead of denying it by name.
- State the seven-tool composition, the conditional `read_image` registration (Host `attachments` service) and the image-capable route prerequisite in `docs/review.md`, `README.md` and the DSH coupling inventory.
- Extend the preset, deny-set and documentation tests to cover `read_image`.
- No change to the reviewer model, review configuration, record schema, CLI version or review actions.

## Capabilities

### Modified Capabilities

- `tool-surface`: the reviewer preset composes `read_image` in addition to the existing read, search, web and reviewer tools; the effective catalog keeps the preset's registered tools (six when the Host lacks `attachments`) and still denies inherited Host tools.
- `review-documentation`: the review document names the seven-tool reviewer catalog and the image-read prerequisites.

## Impact

- `cordis.patch.yml`: `readImage: true` in the preset's `tool-fs` row.
- `reviewer.js`: `read_image` in `PRESET_TOOL_NAMES` and the catalog comment.
- `docs/review.md`, `README.md`, `docs/upgrading-dsh-runtime.md`: reviewer catalog and prerequisite wording.
- `test/review.test.mjs`, `test/review-doc.test.mjs`: preset assertion, deny-set exclusion and documentation checks.
- No package dependency, `engines.dsh`, review configuration or record-schema change; `read_image` additionally needs the Host `attachments` service and an image-capable reviewer route.
