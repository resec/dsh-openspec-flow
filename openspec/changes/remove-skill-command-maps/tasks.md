# Tasks: Remove skill command maps

## 1. Skill text

- [x] 1.1 Remove the `## Command map` section from the six packaged workflow skills
- [x] 1.2 Replace remaining CLI command references in skill bodies with prose

## 2. Tests

- [x] 2.1 Assert that no packaged skill contains a command map or a fenced `openspec` command

## 3. Sync

- [x] 3.1 Run `openspec_init` to sync `.dsh/skills` and verify the backup and the new text

## 4. Verification

- [x] 4.1 Run `node --test test/` and `openspec_validate remove-skill-command-maps`
