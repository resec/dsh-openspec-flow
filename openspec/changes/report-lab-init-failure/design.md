# Design

## Context

See `proposal.md` - Why. The relevant current state:

- `scripts/lab/index.mjs` builds the profile failure message inline as `` `could not initialize ${profile}: ${(init.stderr || init.stdout).slice(-1_500)}` ``.
- `scripts/lab/core/process.mjs` already owns the bounded child-process helpers (`run`, `startLogged`) and is imported by `scripts/lab/index.mjs` and `scripts/lab/cli.mjs`.
- Tests reach lab internals through `scripts/lab/core/*.mjs` modules directly (for example `test/lab-doctor.test.mjs`), so a helper that lives in `core/process.mjs` is testable without Chromium, DSH or a network.
- The coverage gate instruments `lib/**` and `index.js` only, so `scripts/**` changes are guarded by their own regression tests rather than by the coverage verdict.

## Goals / Non-Goals

**Goals:**

- Keep the cause (the head of the output) and the trailing context (the stack tail) in one bounded message.
- Make the omission visible, so a reader does not mistake a truncated message for the whole output.
- Cover the helper with plain Node tests that run in `npm test`.

**Non-Goals:**

- Changing the report schema, the run directory layout or any other lab error message.
- Parsing or classifying DSH errors.
- Changing the plugin runtime, the tarball contents or the coverage scope.

## Decisions

**Decision 1: a head-and-tail budget instead of a tail-only slice.**

Keep roughly 60 percent of the budget from the head and the rest from the tail. The head carries the identifying line; the tail carries the last stack frames and the exit error code. Alternative considered: raise the tail-only limit to the full `maxBuffer` (16 MiB) — rejected, because a noisy DSH boot would then flood the terminal and the report, and the head would still be missing whenever the output exceeds the limit.

**Decision 2: put the helper in `core/process.mjs`.**

Reasons: that module already owns command output, `index.mjs` already imports from it, and the existing test convention imports `core/*` modules directly. Alternative considered: exporting from `scripts/lab/index.mjs` — rejected, because that module pulls Playwright and the whole lab surface into the unit test.

**Decision 3: treat non-string input as empty rather than throwing.**

A missing `stdout`/`stderr` must not replace the real failure with a `TypeError`. Alternative considered: assert on the type — rejected, as it adds a failure mode to an error path.

**Decision 4: the budget excludes the omission marker.**

`OUTPUT_SUMMARY_LIMIT` bounds the retained output; the marker is added on top. Alternative considered: counting the marker inside the budget — rejected, as it makes the retained size depend on the marker's length and complicates the guarantee the spec states.

## Risks / Trade-offs

- [A failure whose cause sits in the middle of the output still loses that middle] → The spec requires the head and the tail only; the full output stays in the run directory and the message keeps the run path, so the middle remains recoverable. Documented in the requirement rather than silently accepted.
- [Raising or lowering the budget changes snapshots in future tests] → The constant is exported and used by the tests, so a change is a single edit.
- [Splitting at arbitrary character offsets can cut a multi-byte grapheme] → Accepted: the message is terminal/agent-facing diagnostics, not data handed to a parser; `slice` on a JS string never produces invalid UTF-16.

## Migration Plan

Not applicable: no stored data, no configuration, no runtime surface. Rollback is reverting the commit.
