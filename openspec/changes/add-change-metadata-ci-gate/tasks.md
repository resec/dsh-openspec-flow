# Tasks

## 1. Add the change-metadata gate

- [ ] 1.1 Create `scripts/check-change-metadata.mjs` with active-change discovery, one `status --change <name> --json` call per change and the `main` entrypoint; verify `node scripts/check-change-metadata.mjs` exits zero on this change.
- [ ] 1.2 Add `test/check-change-metadata.test.mjs` covering the embedded malformed PR #30 bytes, valid metadata, a change with no `.openspec.yaml`, an unknown schema, no active changes, sorted multi-change calls, a first-change failure that still checks and reports the second change, nonzero and zero-exit error payloads, unreadable output, and resolver and spawn failures; verify `node --test test/check-change-metadata.test.mjs` passes.

## 2. Wire the gate into the OpenSpec check

- [ ] 2.1 Append `node scripts/check-change-metadata.mjs` to the `openspec:check` script in `package.json`; verify `npm run openspec:check` passes on this repository.
- [ ] 2.2 Extend the `openspec:check` assertion in `test/hooks.test.mjs` to require the metadata gate; verify `node --test test/hooks.test.mjs` passes.
- [ ] 2.3 Update the verification paragraph in `AGENTS.md` to state that `openspec:check` loads every active change's metadata; verify the paragraph names the gate.

## 3. Verification

- [ ] 3.1 Run `npm run verify` on Node 24 and `openspec_inspect` with `action: "validate"` and `strict: true`; confirm both pass and record the results.
