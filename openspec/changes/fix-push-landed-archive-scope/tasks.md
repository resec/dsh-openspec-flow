# Tasks

## 1. Narrow the archive whitelist

- [ ] 1.1 Accept `openspec/changes/archive/<date>-<change>/` only for the manifest's change, keeping `openspec/specs/` and deletions under the former directory.

## 2. Align the documentation

- [ ] 2.1 Rewrite the archive check bullet in `docs/land-push.md` to the narrowed rule.

## 3. Guard both directions

- [ ] 3.1 Add a test that a normal archive commit (own directory and specs) passes.
- [ ] 3.2 Add a test that an archive commit touching another archived change is refused and names the path.
- [ ] 3.3 Confirm the refusal test fails against the previous whitelist.

## 4. Verify

- [ ] 4.1 Run `node --test test/push-landed.test.mjs`.
- [ ] 4.2 Run `/tmp/b3/gates.sh fix-push-landed-archive-scope`.
