# Tasks

## 1. Scope both listings by label

- [x] 1.1 Add `--label mergeable` and the exported `PR_LIST_LIMIT` to the `candidates` listing request in `scripts/pr-review-land.mjs`.
- [x] 1.2 Add `--label owner-review` and the exported `PR_LIST_LIMIT` to the reconcile listing request in `scripts/pr-review-owner-review.mjs`.

## 2. Report a listing that reaches the cap

- [x] 2.1 Return a `truncated` note with the entry count from `candidates` when the listing returns `PR_LIST_LIMIT` entries.
- [x] 2.2 Return the same note from reconcile and print it as a `warning:` line in the text output.

## 3. Guard the behavior

- [x] 3.1 Record the `gh pr list` arguments in `test/pr-review-land.test.mjs` and `test/pr-review-owner-review.test.mjs`; assert the label, the cap and the absence of `--search`.
- [x] 3.2 Assert the truncation note for a listing of exactly `PR_LIST_LIMIT` entries and its absence below the cap.
- [x] 3.3 Confirm the new assertions fail with the implementation reverted.

## 4. Document the listing

- [x] 4.1 Name the label-scoped listing, the 200 entry cap and the truncation note in `docs/pr-review.md`.

## 5. Verify

- [x] 5.1 Run `node --test test/pr-review-land.test.mjs` and `node --test test/pr-review-owner-review.test.mjs`.
- [x] 5.2 Run `/tmp/b3/gates.sh fix-label-scoped-lists` on Node 24 and record the summary.
