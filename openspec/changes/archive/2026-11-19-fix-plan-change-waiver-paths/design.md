# Design: fix-plan-change-waiver-paths

## Context

See `proposal.md` for the failure. The relevant current state:

- `collectDraftArtifacts` records each artifact as `{ path, sha256 }` where `path` comes from `relative(changeRoot, …)`, so drift paths are always change-relative POSIX paths (`proposal.md`, `tasks.md`, `specs/<capability>/spec.md`).
- `diffArtifactFiles` returns `{ path, status }` from the same recorded paths.
- `waivePlanChange` trims, drops empty entries, de-duplicates and sorts the raw `files` strings, then writes them unchanged.
- `applyReviewEntry` builds `covered` from the recorded strings and checks `covered.has(file.path)`.
- The waiver result is the draft projection, so its `ready` describes the draft, not the waiver's coverage.
- A change directory may sit outside the project root for a store-backed change; `relativeChangePath` (review.js:1957) returns undefined in that case. `applyReviewEntry` uses `worktreeRelative(…) ?? ''` for the clean-tree filter (review.js:870), a different purpose.

Constraints: plain ESM with Node built-ins, no dependency, no review record schema change, existing waiver files must stay readable.

## Goals / Non-Goals

**Goals**

- One normalizer shared by the write path and the compare path.
- A legacy waiver becomes effective without a manual migration.
- The waive result states coverage only when it is known.
- Accepted forms and refusals are stated in the tool description and the shipped docs.

**Non-Goals**

- No case folding, symlink resolution or Unicode normalization; comparison stays byte-for-byte after slash normalization.
- No filesystem existence check, so a file created later is still waivable.
- No change to the review record schema, the brief layout or the card payload.
- No support for a path that names another change, even when it resolves inside the planning home.

## Decisions

### The normalizer lives in `lib/review/waiver.js`

`lib/review/object.js` owns artifact hashing and has no notion of the project root or the change path. The waiver input contract needs both, so a separate pure module keeps `object.js` focused and makes the rules unit-testable without a Host context.

Signature: `normalizeWaiverFiles(files, { changeRoot, changePath })` returning `{ files, refused }`, where `files` is sorted and de-duplicated and `refused` carries `{ input, reason }` entries. Only the current `waive` call turns its own refused entries into one error that names every refused entry; the existing recorded list and the compare path drop refused recorded entries without failing the call. `refused` is not added to the tool output schema.

### One changePath source for both call sites

Both `waivePlanChange` and `applyReviewEntry` derive `changePath` with `relativeChangePath(context.rootPath, context.changeRoot)`, the exported helper that returns undefined for a change directory outside the project root. The clean-tree filter keeps its existing `worktreeRelative` call; the two helpers answer different questions (worktree root versus planning root) and must not be conflated.

Alternative considered: reuse `worktreeRelative`. Rejected because it reports relative to the worktree root, while the review paths are relative to the planning root `rootPath`.

### Resolution order

The tool first trims and drops an empty entry, as it does today. The normalizer then, for each remaining entry:

1. Normalize `\` to `/`, then `posix.normalize`.
2. Absolute path: take `relative(changeRoot, resolve(entry))`; refuse when the result is absolute or starts with `..`.
3. When `changePath` is defined and the entry equals `changePath` or starts with `${changePath}/`, strip that prefix (the bare change directory itself is refused later).
4. Otherwise, when the entry starts with `openspec/changes/`, refuse: it names another change, or it is the project-relative form of this change in a store-backed project where the prefix cannot be confirmed.
5. Otherwise, when the entry starts with `openspec/`, refuse: it is a project-relative path outside the change directory (for example a main spec).
6. Otherwise treat the entry as change-relative.
7. Refuse when the result is empty, `.`, starts with `..`, or is absolute.

Step 5 closes the gap where `openspec/specs/theme/spec.md` was recorded as a change-relative path that could never match. A change artifact never carries an `openspec/` prefix, so the rule cannot reject a legitimate file.

### Store-backed changes

With `changePath` undefined, steps 3 to 5 cannot confirm the prefix. Change-relative and absolute forms still normalize; every project-relative `openspec/` form is refused with an error that names the change directory and asks for a change-relative path. That is stricter than today but never silently records a path that cannot match.

Alternative considered: accept `openspec/changes/<this-change>/…` by string comparison with the change name. Rejected because the change name alone does not prove the prefix is the planning root (a store change may live deeper), and the existing helper already reports the unknown case.

### Write path

`waivePlanChange` normalizes the incoming list, normalizes `existing.files` before merging, and writes the merged normalized set. An existing entry that cannot be normalized is dropped from the merged set without failing the call; only an entry from the current call is reported as refused. This repairs a legacy record on the next waiver while keeping a stale entry from blocking an unrelated approval.

### Compare path

`applyReviewEntry` normalizes `planWaiver.files` with the same `changePath` before building `covered`, so a waiver recorded by any earlier version still matches. The normalized set is what the result and the brief report.

### Coverage result

`waivePlanChange` builds its result explicitly instead of reusing the draft projection:

- No apply record, but apply started (the draft record carries an apply base commit): record the waiver, report `ready: false`, reason that coverage is checked when the apply review starts, `nextAction: openspec_review action=start review=apply`.
- Apply record exists, draft record or `intent.md` missing (draft review disabled): record the waiver, report `ready: false`, reason that coverage cannot be computed without the draft record; never call `draftObject` in this state.
- Apply record exists and the draft record carries no `artifactFiles` array (legacy record): mirror `applyReviewEntry`'s guard and treat the drift as empty, reporting `ready: false` with a reason that no per-file drift was recorded; never call `diffArtifactFiles(undefined, …)`, which would list every artifact as added.
- Apply record exists and the per-file list is available: compute `diffArtifactFiles`; an empty drift reports `ready: false` with a reason that no drift is pending; a non-empty, fully covered drift reports `ready: true`; otherwise list the uncovered files and report `ready: false`.
- A drift computation that throws (a missing artifact) is caught and downgraded to the not-established result with the error text as the reason.

`projectReview` gains an explicit `ready` override used only by this path, so the draft readiness is not reused for a claim it did not make.

### Brief and card

The brief receives the in-memory normalized waiver from `applyReviewEntry`. `writeRoundCard` keeps reading `plan-change-waiver.json` from disk (review.js:289), so on a legacy record the card shows the recorded forms until the next waiver rewrites the file. The design states this difference; it does not claim both surfaces are normalized.

## Risks / Trade-offs

- A legacy waiver with an entry that cannot be normalized is dropped from the file on the next waiver. Mitigation: the compare path ignores it, the start error names the actual unwaived drift files, and the dropped entry is visible in the stored diff.
- Refusing every project-relative form in a store-backed change is stricter than today. Mitigation: the error names the change directory and the accepted change-relative form; a legitimate caller has the absolute or change-relative path at hand.
- A path that is valid only under case-insensitive comparison will not match. Mitigation: documented as byte comparison after slash normalization.
- A change-relative path that happens to start with `openspec/` (for example a nested artifact directory named `openspec/`) is refused. Mitigation: the change artifact set uses `proposal.md`, `tasks.md`, `design.md`, `specs/` and `.openspec.yaml`, so this cannot occur in practice and the refusal is explicit.

## Migration Plan

None. Existing waiver files stay in place; the compare path normalizes them on read, and the next waiver rewrites the set. Rollback is a code revert; recorded files with mixed forms remain readable by the current version.

## Open Questions

None. The accepted forms, the refusal cases, the store rule and the result behavior are fixed by the delta specs.
