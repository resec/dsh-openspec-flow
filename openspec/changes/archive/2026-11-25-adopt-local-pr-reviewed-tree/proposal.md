# Adopt a re-reviewed local pull-request tree

## Why

A local owner entry records the reviewed tree at publication, and `verify`, `retarget` and `finish` all anchor on that tree. When a pull request is updated after publication and re-reviewed, the landed tree changes but no supported command updates the entry; `finish` then cannot find the landed manifest, and the only workaround is editing `.cache/pr-review/local-prs.json` by hand. A legitimate re-review must be recordable without bypassing the review-tree checks.

## What Changes

- Add `pr-local-land adopt <n> --tree <sha> --session <id> [--token] [--apply]`: a dry-run-by-default command that updates the entry's `head` and `tree` after verifying a passed apply review and a current source for the tree.
- Make `verify` name the adopt command on a merged-tree mismatch, make `recover` plan adoption when the merged tree has a passed review, and make `finish` name adoption when a landed manifest for a different tree is on `main`.
- Document the adoption route and its ordering in `docs/local-pr.md` and `AGENTS.md`.
- Keep `finish` strict: adoption is explicit, and no command silently rewrites the reviewed tree.

## Capabilities

### Modified Capabilities

- `pr-review-pipeline`: the local pull-request landing requirement gains the adoption gate; the retarget/land and recovery requirements gain adoption scenarios; new requirements define the adopt command, the source precedence, the mismatch guidance and the documentation.

## Impact

- `scripts/pr-local-land.mjs`: the adopt command, CLI, and the verify, recover and finish guidance.
- `scripts/pr-local-shared.mjs`: landed-manifest lookup by change.
- `docs/local-pr.md`, `AGENTS.md`.
- `test/pr-local-land.test.mjs`, `test/local-pr-doc.test.mjs`, `test/contributor-docs.test.mjs`.
- No dependencies, package metadata or public tool surface changes.
