# Design: redact-host-paths

## Context

- 48 commits on `main`, no tags, no merges, no signed commits; `origin/main` is `217a8c1`.
- `README.md` carries an absolute path under `/home/<user>/` in every commit.
- History also holds `eval/fixtures/dumps/headless-official.yml`, `eval/fixtures/dumps/headless-plugin.yml` and `eval/fixtures/sessions/sample.v4.jsonl.zstd`; `eval/` was removed from HEAD in commit `1203000`.
- `git filter-repo` is not installed; `git filter-branch` is available. Node 24.22.2 provides `zstdDecompressSync` and `zstdCompressSync`.
- The sibling `dsh-openspec-flow-eval` repository pins `14dada0`, `3f30caf`, `4a3b5077` and `6fd4df36` from this history.

## Goals / Non-Goals

Goals: no reachable commit exposes a host path in text or decompressed zstd content; rewritten commits keep author, committer, dates and message; the old-to-new SHA map is recorded for the eval change.

Non-Goals: adding a pre-push host-path gate (separate change); updating short SHAs quoted in archived change records; rewriting the eval repository here.

## Decisions

### Use filter-branch rather than installing filter-repo

The history is small and the only content changes are deterministic string replacements plus one zstd fixture. `filter-branch` is built in and needs no new dependency; a mirror-clone dry run covers its deprecation risk.

### Rewrite only `main`

`filter-branch ... -- main` leaves `refs/remotes/origin/main` at the old commit, so the push can use `--force-with-lease=main:<old SHA>` and fail if the remote moved.

### Rewrite blobs through an index filter

For each commit, the index filter visits `README.md`, `*/fixtures/dumps/*.yml`, `*/tasks.md` and `*/fixtures/sessions/*.zstd`, reads the blob, runs a Node helper and updates the index only when the blob changed. Text uses the mapping table; zstd is decompressed, rewritten as JSONL text and recompressed. A no-op path leaves the tree untouched.

### Record the commit map from a commit filter

The commit filter wraps `git commit-tree "$@"`, appends `$GIT_COMMIT $new` to a map file outside the repository and prints the new SHA. The map feeds the eval pin update.

### Replace placeholders by context

| Context | Replacement |
| --- | --- |
| README installation example | `/path/to/dsh-openspec-flow` |
| dump comment, private profile | `~/.dsh/profiles/headless/cordis.patch.yml` |
| dump comment, plugin patch | `<plugin-repo>/eval/patches/<name>.yml` |
| archived task command | `<workspace>/.tools/node-v24.22.2-linux-x64/bin` |
| session fixture cwd | `/tmp/phase0-project` |
| fallback | `<home>` |

## Risks / Trade-offs

- `filter-branch` is deprecated and can mangle history → dry-run on a mirror clone; verify commit count, metadata and tree diffs before pushing.
- Recompressing the zstd fixture changes its bytes → the offline session test asserts recorded token and step values, not the cwd string; run it after the rewrite.
- Every SHA changes → the eval change remaps its four pins; external references to old SHAs break.
- Force-push may be rejected by branch protection → it is an explicit pre-flight check; the backup bundle is the rollback source.
- GitHub may keep old objects reachable by SHA → documented as residual risk; a support request is out of scope.
- The mirror dry run creates a temporary clone outside both repositories; it is deleted after verification.

## Migration Plan

1. Bundle both histories and record baseline scans.
2. Rewrite this repository, verify, archive the change.
3. Push `main` with an explicit lease, then update the eval pins and push the eval change.
4. Roll back by restoring the bundle and force-pushing the old HEAD; this re-exposes the removed content and is a last resort.

## Open Questions

None.
