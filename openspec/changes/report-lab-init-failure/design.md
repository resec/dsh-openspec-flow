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

- Changing the report schema or the naming of the existing artifacts. The new `init-<mode>.log` is additive.
- Changing any other lab error message. Six tail-truncations remain in `core/cache.mjs`, `core/install.mjs` and `index.mjs`; each needs its own change.
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

**Decision 5: no caller-supplied limit, and a named head share.**

The budget is two module constants: `OUTPUT_SUMMARY_LIMIT` (1,500) and `OUTPUT_SUMMARY_HEAD` (900); the tail takes the remainder, so it is never empty. The only caller uses the default, and a caller-supplied budget had created a defect class: with a `limit` of two or less, `Math.ceil(limit * 0.6)` consumed the whole budget, the tail length became zero, and `slice(-0)` — which is `slice(0)` — returned the entire output. Alternative considered: validate the argument and throw — rejected, because it adds a failure mode to a path that is already failing, for an input no caller needs. The head-below-limit invariant is a test rather than a clamp in the helper, so the split carries no unreachable guard.

**Decision 6: the untouched output lands in the run directory.**

`ensureProfile` used `run()`, which captures the streams with `spawnSync` and writes nothing, so the bounded message was the only copy of a failure. The failure path now hands the captured result to `recordProfileInitFailure`, which writes `<run>/artifacts/init-<mode>.log` and names that file in the message. Alternative considered: leave the claim out of the spec — rejected, because a stack-heavy boot failure keeps its first frames in the middle, which is exactly the part the summary drops; a diagnostics change that discards the diagnosis is not finished.

**Decision 7: a rejected write degrades, it does not mask.**

`recordProfileInitFailure` catches a write failure and returns the message without a path. The alternative — letting `ENOSPC` or `EACCES` escape — replaces the reason the profile would not boot with a filesystem error, which is the failure mode this change exists to remove. The consequence is recorded in the spec: the file is named only when it was written.

**Decision 8: surrounding whitespace is dropped.**

`trim()` runs before the split so the retained head starts at content and the retained tail does not end in blank lines, which a truncated stderr tail otherwise does. Alternative considered: keep the bytes verbatim — rejected, as it spends part of the budget on whitespace and hides the last meaningful line.

**Decision 9: a summary is only taken when it shortens the output.**

An output just past the budget would otherwise come back longer than it went in, because the marker costs five characters. Outputs up to the budget plus the marker are therefore returned whole. Alternative considered: always summarize past the budget — rejected, as it makes a 1,501-character output grow to 1,505 characters and breaks the intuition that a bound bounds.

## Risks / Trade-offs

- [A failure whose cause sits in the middle of the output still loses that middle in the message] → The spec requires the head and the tail only; the untouched output now sits in `<run>/artifacts/init-<mode>.log` and the message names it, so the middle stays recoverable.
- [Changing the budget or the head share moves test expectations] → The tests import `OUTPUT_SUMMARY_LIMIT` and `OUTPUT_SUMMARY_HEAD`, so both values travel with the constants.
- [A rejected artifact write silently drops the full output] → The message still carries both ends, and the failure is visible in the run directory's absence of the file; the spec records the degradation rather than pretending the write always succeeds.
- [A new artifact name appears under the run directory without a report entry] → The message carries the path and the report records the message, so the file is discoverable from the evidence that a caller already holds.
- [Splitting at arbitrary character offsets can cut a multi-byte grapheme] → Accepted: the message is terminal/agent-facing diagnostics, not data handed to a parser; `slice` on a JS string never produces invalid UTF-16.

## Migration Plan

Not applicable: no stored data, no configuration, no runtime surface. Rollback is reverting the commit.
