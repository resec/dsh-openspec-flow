# Tasks

## 1. Match the archive directory exactly

- [x] 1.1 Replace the `endsWith('-<change>')` check in `archiveLanding` with a comparison of the directory name after the archive date prefix.
- [x] 1.2 Read the archive directory only when it exists, so a missing directory stays "no archive directory".

## 2. Cover the match

- [x] 2.1 Add a test where `<change>-extra`, a name that ends with the change, and an undated name are present: each is refused, and the exact directory is then accepted with its commit recorded.
- [x] 2.2 Add a test where the archive directory is missing: the landing is refused and records `archive-failed`.
- [x] 2.3 Confirm the new assertions fail against the previous suffix match.

## 3. Verify

- [x] 3.1 Run `node --test test/pr-review-land.test.mjs`.
- [x] 3.2 Run `/tmp/b3/gates.sh fix-archive-dir-exact` on Node 24 after the implementation commit, and record the test summary and the coverage verdict.
