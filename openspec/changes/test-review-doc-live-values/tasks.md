# Tasks

## 1. Read the values from the implementation

- [x] 1.1 Import `MAX_REQUIREMENT_DESCRIPTION`, read the `waitMinutes` bound from the settings diagnostic, and read the `extend` bound from the argument check.
- [x] 1.2 Build an apply brief and read the three base source lines and the `validation: … (N issues)` format from it.
- [x] 1.3 Close a stale round in a temporary directory and read the cause and the two hash fields it records.
- [x] 1.4 Submit a finding that names another change and read the report field the refusal points at.

## 2. Compare the document with those values

- [x] 2.1 Compare the document's length limit, both `waitMinutes` bounds, the `minutes` bound, the three base sources, the `validation:` line, the stale-round cause and fields, and the cross-change field in `checkDocument`.
- [x] 2.2 Drop the literal `500 字符上限` and the literal stale-round field from the assertions they were pinned in.
- [x] 2.3 Add a negative case that raises each bound and expects `checkDocument` to report the stale value by name.

## 3. Verify

- [x] 3.1 Confirm the new test fails when the code moves: set the length constant to 600 and the `extend` bound to 20 and run `node --test test/review-doc.test.mjs` (3 failures); the same run against the previous test file passes 26/26.
- [x] 3.2 Confirm the new test fails when the document moves: change `500` to `501` and `1–15` to `1–20` in `docs/review.md` and run `node --test test/review-doc.test.mjs` (`stale requirement length limit: 501, expected 500`, `stale extend bound: 1–20, expected 1–15`).
- [x] 3.3 Run `/tmp/b3/gates.sh test-review-doc-live-values` (strict validate, `openspec:check`, the requirement length gate, the generated-skills check, `check:pr`, `npm run verify`).
