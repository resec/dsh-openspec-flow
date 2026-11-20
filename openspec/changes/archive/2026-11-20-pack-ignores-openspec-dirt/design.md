# Design: Packing while OpenSpec artifacts are uncommitted

## Context

See `proposal.md` — Why. Today `lib/pack.js` reads `git status --porcelain`, turns every line into a path through `dirtyPaths` in `lib/bundle.js` (`line.slice(3).trim()`), and refuses the pack when the list is not empty. The review store already parses the same output safely: `statusLinePath` in `lib/review/store.js` takes the destination side of `R  old -> new` and unquotes a C-quoted name, with tests in `test/review-lock.test.mjs`. The packaging gate does neither, so a rename prints an unusable `old -> new` string and a quoted path keeps its quotes.

## Goals / Non-Goals

**Goals**

- Only paths that can change the packed bytes decide the gate.
- Uncommitted paths under `openspec/` never block a pack, and the output says they were ignored.
- A rename is judged by both of its paths.
- The status parser the plugin uses exists once, in `lib/status-paths.js`, shared by the review store and packaging.

**Non-Goals**

- Widening the ignored set beyond `openspec/` (`test/`, `scripts/`, `docs/` keep blocking).
- Reworking the separate porcelain parser in `scripts/affected-tests.mjs`, which keeps its own destination-side copy and is out of scope; the Goal above covers the plugin's two call sites.
- Changing the tarball's file set, the metadata fields, the content check or the install procedure.
- Packing from a temporary checkout of `HEAD` instead of the working tree — that would remove the gate entirely, which is a larger change than this one.

## Decisions

### D1. Ignore exactly `openspec/`, not every unpublished path

The gate ignores a dirty path when its normalized form is `openspec` or starts with `openspec/`. Everything else keeps blocking.

- Rationale: this is the smallest change that removes the reported friction, and it matches the notion of planning dirt the review store already accepts (`filterUnrelatedChangeStatus` drops another change's uncommitted artifacts).
- Alternative rejected: "block only paths inside the published set". It looks cleaner, but the published set must be enumerated from both the worktree and `HEAD`: a deleted `lib/x.js` is absent from the worktree walk, so a worktree-only set would wave the deletion through and the metadata revision would then misdescribe the tarball. Reusing a path prefix avoids that class of bug for one directory this change cares about.

### D2. A rename is judged by both sides

`R  lib/a.js -> openspec/x.md` blocks on the old path. The worktree no longer holds `lib/a.js`, so the packaged set silently loses it; parsing only the destination would wave the rename through.

- Consequence: `dirtyPaths` returns both sides of a rename, so the classifier can see `lib/a.js` and `openspec/x.md` as separate paths.
- Alternative rejected: shelling out with `git status --porcelain -z` and parsing NUL-separated entries. It is quote-free, but the review store and its tests use the newline form, and switching both call sites is a wider change than this one needs.

### D3. Module ownership

`statusLinePath` and a sibling that returns both sides of a line move to `lib/status-paths.js`. The same module owns the `openspec/` classification rule: it exports `splitDirtyPaths(dirtyPaths)` returning `{ blocking, ignored }`, and normalizes `\` to `/` before the prefix test. `lib/review/store.js` re-exports `statusLinePath` so its public surface and `test/review-lock.test.mjs` stay as they are, and `lib/bundle.js` re-exports `splitDirtyPaths` beside `dirtyPaths`, which it rewrites to use the shared parser.

- Rationale: packaging must not import the review store, and the review store must not grow a packaging dependency. A leaf module keeps the dependency direction clean, and one module owning both the split and the rule keeps the classifier reachable from a single import.
- Alternative rejected: duplicate a second parser inside `lib/bundle.js`. Two parsers drift, and the rename edge would only be fixed in one of them.

### D4. Classification is pure; the entrypoint only prints

`lib/pack.js` calls `splitDirtyPaths(dirtyPaths(...))`, prints blocking paths as errors, prints ignored paths as an informational line, and returns exit code 1 only when `blocking` is not empty. `USAGE_LINES` states the narrowed rule instead of "The tree must be clean."

- Rationale: the exit-code contract and the message shape become testable without a repository, matching how `pack.test.mjs` already drives `runPack` with an injected `exec`. The help text is user-facing, so a test asserting the new sentence is the only thing that keeps it from drifting back.
- Alternative rejected: putting the prefix test inline in `runPack`. It would be reachable only through the subprocess-shaped test.

### D5. Keep `dirty: false` in the metadata

The field reports whether the packed content differs from `HEAD`, not whether the tree is dirty: uncommitted `openspec/` paths cannot enter the tarball, so the published content still equals `HEAD` and the flag stays false. The delta redefines the metadata requirement that way and its OpenSpec-only scenario states the value; the content check is the backstop if the published list ever grows into `openspec/`.

## Risks / Trade-offs

- [A future `files` entry pulls an `openspec/` path into the tarball and the gate ignores it] → `verifyTarball` rejects every `openspec/` path, so the pack fails with a forbidden-path error instead of publishing; the task list adds a test for the classifier and the content check keeps its own.
- [The parser move changes review-store behavior] → `statusLinePath` is re-exported and `test/review-lock.test.mjs` keeps asserting the rename and quoted-name cases unchanged.
- [`scripts/affected-tests.mjs` keeps a third copy of the parsing`] → out of scope here, named in the proposal's impact list; the script only selects tests and cannot change a verdict.
- [Windows checkout prints backslashes] → classification normalizes `\` to `/` before the prefix test, and a task asserts a backslash `openspec\changes\...` path is ignored while a nested `packages\x\openspec\changes\...` path still blocks.
- [Ignoring `openspec/` hides an accidental edit to a spec the pack depends on] → the pack depends on no OpenSpec file; `npm run verify` and the pre-push gates still run over the change, and the tarball's file list is unchanged.

## Migration Plan

No data migration. The behavior ships with the next packed artifact; until then the installed copy keeps the old gate. Rollback reverts the classifier use in `lib/pack.js` and the three documentation paragraphs; reverting the parser move alone is behavior-preserving for the review store.
