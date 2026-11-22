# Proposal: Archive commit records the land commit in its body

## Why

Land creates an archive commit whose subject ends with `via land <8-char sha>`. The subject is the part a reader scans in `git log`, and the eight characters are an abbreviation of a commit already identified by the archive commit's parent and by the landed manifest. The suffix adds noise to every landed archive and duplicates a relation git already records, while the abbreviation cannot be resolved from the subject alone when it is quoted outside the repository.

## What Changes

- The archive commit subject becomes `chore(openspec): archive <change>`, with no land sha or other suffix.
- The archive commit body carries one line, `Landed from <landCommit>`, using the full object id, so the land relation stays readable and resolvable from the commit itself.
- The regression test asserts the new subject and the body instead of the `via land` subject.
- The `apply-worktree` capability gains a requirement for the archive commit message format; the landed manifest, push verification and existing history are unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `apply-worktree`: the land requirements gain the archive commit message format (subject and `Landed from` body). The land sequence, manifest fields and push checks do not change.

## Impact

- `lib/worktree/land.js`: the `commitArchive` commit invocation.
- `test/worktree-land.test.mjs`: the archive commit subject assertion and a new body assertion.
- `openspec/specs/apply-worktree/spec.md`: one added requirement after archive.
- No API, dependency or manifest change. Already landed archive commits are not rewritten; only subsequent lands use the new message.
