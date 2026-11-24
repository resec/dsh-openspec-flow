# Tasks

## 1. Match the archive directory exactly

- [x] 1.1 Replace the `endsWith('-<change>')` match in the land archive retry with a comparison of the directory name after the archive date prefix.

## 2. Cover the match

- [x] 2.1 Add a test where `<change>-extra`, a name that ends with the change, and an undated name coexist with the exact directory: only the exact directory is committed.
- [x] 2.2 Add a test where only those foreign directories exist: the retry is refused and the state stays `landing`.
- [x] 2.3 Confirm both new assertions fail against the previous suffix match.

## 3. Verify

- [x] 3.1 Run `node --test test/worktree-land.test.mjs`.
- [x] 3.2 Run `/tmp/b3/gates.sh fix-land-archive-dir-exact` on Node 24 after the implementation commit, and record the test summary and the coverage verdict.
