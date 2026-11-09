# Tasks: redact-host-paths

## 1. Baseline

- [x] 1.1 Create `../.backup/flow-pre-rewrite.bundle` with `git bundle create ... --all` and verify it with `git bundle verify`
- [x] 1.2 Record the baseline scan in `../.redact/baseline-flow.txt`: 48 commits with text hits and 13 commits carrying the zstd fixture, plus HEAD `217a8c1`

## 2. Rewrite tooling

- [x] 2.1 Add `../.redact/rewrite-blob.mjs` and the index/commit filter scripts, then verify the blob mapping is idempotent by running it twice on the same input and diffing the output
- [x] 2.2 Run the full rewrite on a mirror clone and verify it produces 48 rewritten commits, preserves every author, committer, date and message, and leaves no host path in text or decompressed zstd content

## 3. Current tree

- [x] 3.1 Replace the installation path in `README.md` with `/path/to/dsh-openspec-flow`, commit the change artifacts and README, and verify `git grep -nE '/home/[^/]+/'` prints nothing and `git status --porcelain` is empty

## 4. History rewrite

- [x] 4.1 Rewrite `main` with the index and commit filters and verify the map file has one line per pre-rewrite commit (49 at apply time: 48 baseline plus the change commit), `refs/original/refs/heads/main` exists, and `git rev-list --count main` matches the map
- [x] 4.2 Audit every reachable commit for text and decompressed zstd paths, compare author, committer, dates and messages against the baseline, and verify each old/new commit pair differs only in the intended files

## 5. Gates

- [x] 5.1 Run `npm test` on Node 24 and verify the suite passes
- [x] 5.2 Run `npm run coverage:check` on Node 24 and verify the gate passes
- [x] 5.3 Run `openspec_validate` with `strict: true` and verify no findings remain

## Workflow follow-up

- Mark the remaining tasks done, archive the change, commit the archive with the merged spec, and push `main` with `--force-with-lease=main:217a8c138e5e272438d2df51f6c079228900737c`.
- Verify `git ls-remote origin refs/heads/main` equals the local HEAD, then expire reflogs and run `git gc --prune=now`.
