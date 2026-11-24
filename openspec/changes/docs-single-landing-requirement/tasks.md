# Tasks

## 1. Confirm the definition and its duties

- [x] 1.1 Compare `Label-authorized pull-request landing` (contributor-workflow) with `Labeled pull-request landing` (development-workflow); confirm the first is the strict superset.
- [x] 1.2 Check each duty against `scripts/pr-review-land.mjs` and `scripts/push-landed.mjs`: `gh pr merge --rebase`, no label write, no squash, no merge commit, fork branch refused in `sync`, archive gated on the merged tree, force-free push.

## 2. Remove the duplicate

- [x] 2.1 Leave the contributor-workflow requirement as the single definition.
- [x] 2.2 Remove the development-workflow duplicate through a `REMOVED` delta whose Reason and Migration point at the definition.

## 3. Verify

- [ ] 3.1 Run `npx openspec validate docs-single-landing-requirement --strict`.
- [ ] 3.2 Run `npm run openspec:check`.
- [ ] 3.3 Run `node scripts/check-requirement-length.mjs`.
