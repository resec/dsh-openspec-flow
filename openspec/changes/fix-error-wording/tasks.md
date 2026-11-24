# Tasks

## 1. Rewrite the messages

- [x] 1.1 Replace the internal change name in the archive refusal with the user-facing recovery: `openspec_apply_worktree action=land`, or `action=remove` with the user's approval.
- [x] 1.2 Drop the CLI wording from the four schema rejections and name a tool action — `openspec_new_change`, or `openspec_inspect action="status"` for the resolved root — instead of a command.

## 2. Guard the wording

- [x] 2.1 Drive the archive refusal and both schema rejections in `test/descriptions.test.mjs`, then assert no `CLI` token, no bare `openspec <command>` and no change name tracked in `openspec/changes/archive/`.
- [x] 2.2 Confirm the new test fails against the previous messages.

## 3. Verify

- [x] 3.1 Run `node --test test/descriptions.test.mjs`, `node --test test/schema.test.mjs test/apply-worktree.test.mjs`.
- [x] 3.2 Run `/tmp/b3/gates.sh fix-error-wording`.
