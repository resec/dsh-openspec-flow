# Tasks

## 1. Report the review-failed landing before the label gate

- [ ] 1.1 In `listLandingCandidates`, look up the pull request's own landing entry before the label gate and refuse a `review-failed` landing with its recorded failure.
- [ ] 1.2 When that pull request also lacks `mergeable`, add the missing label and the `abandon <n> --apply` command to the same reason.

## 2. Document the recovery

- [ ] 2.1 Update the label-removal step of the Review-failed recovery section in `docs/pr-review.md` to state that the refusal carries the failure and the clearing command.

## 3. Guard the behavior

- [ ] 3.1 Assert that an unlabeled `review-failed` landing is refused with `review-failed`, the recorded error, the missing label and the `abandon 12 --apply` command.
- [ ] 3.2 Assert that running the command removes the landing entry and its checkout, after which the pull request is refused only for the missing label.
- [ ] 3.3 Assert that another pull request's `prepare` is refused while the entry exists and reaches `prepared` after the command.
- [ ] 3.4 Confirm the new assertions fail against the previous candidate loop.

## 4. Verify

- [ ] 4.1 Run `node --test test/pr-review-land.test.mjs`.
- [ ] 4.2 Run `openspec validate fix-landing-review-failed-recovery --strict`, `npm run openspec:check`, `node scripts/check-requirement-length.mjs`, `node scripts/check-pr-change.mjs --base <base>` and `npm run verify`.
