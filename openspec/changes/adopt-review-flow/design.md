# Design: review documentation

## Context

See `proposal.md` — Why. The review implementation has one user-facing gap: no document explains the whole system, and the repository workflow still stops at validate.

## Decisions

### One document owns the explanation

`docs/review.md` is the single narrative. README keeps a short tool/config table and links to it; skills stay procedural. This avoids three copies of the object model and the findings contract.

### The document is checked against code, not prose

`test/review-doc.test.mjs` imports the live tool definitions and config normalization, then asserts that the document names every tool/action and every default/key. It also parses the record path constant. The test does not attempt to verify prose quality.

### The repository workflow names the gates

`development-workflow` gains one requirement: draft review before apply, apply review before archive, and no archive while a review is unready. `AGENTS.md` restates the same gates for contributors.

### No package change

The document is a repository document, not a runtime asset. It stays out of `files` and is served by the repository, not the plugin.

## Risks

- A document can still be semantically stale; the test covers names, defaults and paths only.
- The repository workflow is advisory for contributors; the tools provide the enforced gate.
- The document must not become a second spec; requirement text stays in `openspec/specs/change-review/spec.md`.

## Migration

No runtime migration. Existing links to README remain valid; the new document is additive.
