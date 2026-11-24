# Tasks

## 1. Report the review-failed landing before the label gate

- [x] 1.1 In `listLandingCandidates`, look up the pull request's own landing entry before the label gate and refuse a `review-failed` landing with its recorded failure.
- [x] 1.2 When that pull request also lacks `mergeable`, add the missing label and the `abandon <n> --apply` command to the same reason.

## 2. Document the recovery

- [x] 2.1 Update the label-removal step of the Review-failed recovery section in `docs/pr-review.md` to state that the refusal carries the failure and the clearing command.

## 3. Guard the behavior

- [x] 3.1 Assert that an unlabeled `review-failed` landing is refused with `review-failed`, the recorded error, the missing label and the `abandon 12 --apply` command.
- [x] 3.2 Assert that running the command removes the landing entry and its checkout, after which the pull request is refused only for the missing label.
- [x] 3.3 Assert that another pull request's `prepare` is refused while the entry exists and reaches `prepared` after the command.
- [x] 3.4 Confirm the new assertions fail against the previous candidate loop.

## 4. Verify

- [x] 4.1 Run `node --test test/pr-review-land.test.mjs` (29 pass).
- [x] 4.2 Run `openspec validate fix-landing-review-failed-recovery --strict`, `npm run openspec:check`, `node scripts/check-requirement-length.mjs`, `node scripts/check-pr-change.mjs --base a30f58f` and `npm run verify`.
