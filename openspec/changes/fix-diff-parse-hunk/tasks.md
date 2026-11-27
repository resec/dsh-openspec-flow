# Tasks

## 1. Tighten the file boundary

- [x] 1.1 Recognize `+++ ` as a file header only after a `diff --git` line.
- [x] 1.2 Comment why content lines cannot be file headers.

## 2. Guard the parser

- [x] 2.1 Add a one-file diff whose added lines include `+++ …` and assert every added line is kept.
- [x] 2.2 Add a two-file diff and assert each file keeps its own added lines.
- [x] 2.3 Confirm both assertions fail against the previous header check.

## 3. Verify

- [x] 3.1 Run `node --test test/coverage-gate.test.mjs`.
- [x] 3.2 Run `/tmp/b3/gates.sh fix-diff-parse-hunk`.
