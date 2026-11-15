# Design: reviewer image read tool

## Context

See [proposal.md](proposal.md) for the motivation. The `openspec-reviewer` preset is one `@deepseek-ai/dsh-agent-preset` declaration in `cordis.patch.yml`. Its `tool-fs` child currently enables `read` and disables `readImage`, and the `dsh-openspec-flow/reviewer` entry computes a deny set from the Host's global tool registry, excluding only the names in `PRESET_TOOL_NAMES` (`read`, `grep`, `glob`, `web_search`, `web_fetch`, `openspec_reviewer`).

Two DSH behaviours bound the design. `@deepseek-ai/dsh-tool-fs` registers `read_image` only while a Host `attachments` service is mounted; the call is rejected at execution unless the exact step route declares image input. A tool restriction denies by name, so a global `read_image` (the Host's own `tool-fs` row mounts it by default) must be excluded by name or the preset's scoped tool with the same name is hidden too.

The preset is pinned to DSH `=0.2.2-rc.2`, where `tool-fs` exposes `readImage` and requires no additional field for it.

## Goals / Non-Goals

Goals:

- The reviewer composes `read_image` beside `read` on the pinned runtime.
- The tool is held by the preset's scope, not by a Host tool the deny mask would hide.
- The failure modes stay clean: no attachments means the tool is absent; no image-capable route means the call fails without touching the review record.
- Documentation, tests and the DSH coupling inventory describe the seven-tool catalog.

Non-goals:

- No review configuration key, no per-project image switch and no change to the reviewer model source.
- No change to the review record, report, brief or readiness contracts.
- No change to the `openspec_reviewer` actions; image reads use the filesystem tool, not the reviewer tool.
- No DSH version change.

## Decisions

### Enable the tool in the preset, not through plugin configuration

`readImage: true` is the single switch. A deployment that cannot use images is handled by DSH's own conditions: without the `attachments` service the tool does not register, and without an image-capable route the call fails closed. Adding a `reviews.*.images` configuration key would create a second, review-specific switch for a capability the runtime already gates, and the locked policy would have to carry it across rounds.

### Allowlist `read_image` by name in the reviewer entry

`read_image` joins `PRESET_TOOL_NAMES`. The deny computation reads the global registry; the Host `tool-fs` row registers `read_image` there, so without the allowlist entry the restriction would deny the name and take the preset's scoped tool with it. This mirrors `read`, `grep` and `glob`, which are also global names the preset supplies itself.

### Keep the reviewer route and review actions unchanged

The reviewer keeps the model locked in `policy.json`. `read_image` execution checks whether that route declares image input; a route without it returns a tool error while the report slot, record and other tools stay usable. The alternative — refusing activation when the route is not image-capable — would break reviews for changes that cite no images and would turn an optional capability into a start-up requirement.

### Document the prerequisites next to the catalog

`docs/review.md` states the seven-tool composition, the conditional `read_image` registration and the two prerequisites; `README.md` lists the seven names and the `attachments`/image-route prerequisites in the reviewer paragraph; `docs/upgrading-dsh-runtime.md` records the new coupling in both the `reviewer.js` row and a preset `tool-fs` row (the `readImage` key, `ctx.attachments` and the image-modality route). The documentation test gains the seven names, the conditional wording and the prerequisite phrase so a future edit cannot quietly drop any of them.

### Qualify every catalog claim with the attachment condition

The preset always declares seven tools, but DSH registers `read_image` only while the `attachments` service is mounted. Specs, documents and tests therefore state "seven-tool composition, `read_image` conditional" instead of an unconditional seven-tool catalog; the no-attachments catalog is six and is stated as such. Keeping the unconditional phrasing would make the no-attachments scenario contradict the catalog scenario.

## Risks / Trade-offs

- **The locked reviewer route cannot accept images** → The tool is present but returns an error; the document states the prerequisite, and a new change can lock an image-capable reviewer model (an existing locked policy keeps its model, as the policy-lock section states). No review record changes.
- **The Host has no attachments service** → `read_image` is absent; the preset still activates with the other six tools. The specifications, documents and tests state the conditional registration instead of an unconditional seven-tool catalog.
- **The deny mask regresses when the Host registers `read_image`** → The deny-set test includes `read_image` in its global tool list and asserts it stays out of the deny names.
- **The live profile keeps the old preset until reloaded** → The change is complete only after a reload or restart; the live check starts a disposable reviewer and reads its request header. Until then the unit tests cover the declaration and deny logic.
- **Image results increase reviewer token use** → The reviewer chooses when to call the tool; the brief cites the paths that matter, and no code reads images automatically.

## Migration Plan

1. Enable `readImage` in the preset and add the allowlist entry.
2. Update the specs, documents and tests.
3. Run `npm test`, `npm run coverage:check` and strict validation.
4. Reload the plugin in the linked `web` profile or restart DSH, then start a disposable `reviewers: 1` review, confirm `read_image` is in the reviewer's request header, and have the reviewer read a disposable small PNG generated for the check (not committed; `read_image` accepts PNG/JPEG/WebP/GIF) to confirm a successful image result, or record the clean tool error when the locked route is text-only. Check the no-attachments variant through a temporary profile that omits `attachment-local`, or record the pinned `dsh-tool-fs` registration contract as the verification when the Host cannot omit the service.
5. Rollback restores `readImage: false` and removes the allowlist entry and documentation phrases; no data or record migration is involved.

## Open Questions

None.
