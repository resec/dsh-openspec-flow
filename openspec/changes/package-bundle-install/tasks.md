# Tasks: package-bundle-install

## 1. Packaging module

- [ ] 1.1 Add `lib/bundle.js` and `test/bundle.test.mjs` with the unconditional core path set, the manifest expansion, the metadata builder and the tarball reader (gunzip plus tar header walk over `node:zlib`), and verify the test covers metadata fields, a missing core path (`index.js`), a missing `lib/` path, a forbidden path and a truncated archive.
- [ ] 1.2 Add the dirty-tree refusal, the existing-artifact refusal with `--force` replacement, and the temporary-destination content check that leaves `dist/` unchanged on failure; verify `test/bundle.test.mjs` covers a clean tree, a dirty tree, an existing pair without `--force`, a `--force` repack recording the new revision, a rejected first pack leaving no tarball, metadata or scratch directory, and a rejected `--force` repack leaving the previous pair intact.
- [ ] 1.3 Verify `test/bundle.test.mjs` packs a fixture with the real `npm pack --pack-destination` into a temporary directory and asserts the required entrypoints, a skill and the locale resources are present and the tests are absent.

## 2. Packaging entrypoint

- [ ] 2.1 Raise `package.json` to `0.4.0`, add the `bundle:pack` script, refresh `package-lock.json`, update the plugin version line in `docs/upgrading-openspec-cli.md`, and update the five skills' `metadata.generatedBy` to `dsh-openspec-flow@0.4.0`; verify `test/skills.test.mjs` passes and `git status` shows no lockfile drift.
- [ ] 2.2 Add `scripts/bundle-pack.mjs` that resolves the repository root, accepts `--force`, packs with `npm pack --json --pack-destination <temp> --cache .cache/npm`, runs the content check, moves the pair into `dist/` only after it passes, and prints the tarball path with the install instruction; verify the dirty working tree of this apply is refused with the changed paths named, and that the usage text names `--force`.
- [ ] 2.3 Add `dist/` to `.gitignore` (the tarball is already covered by `*.tgz` and the cache by `.cache/`); verify the ignore rule together with task 4.1, after the committed clean tree produces the first artifact.

## 3. Documentation

- [ ] 3.1 Rewrite the README install section for the package form, add `docs/installing-bundles.md`, and add `lib/bundle.js` and `docs/installing-bundles.md` to the README file inventory; verify both documents name `npm run bundle:pack`, state that the installed copy is frozen against source edits, and state that replacing an installed version removes the bundle before installing the artifact.
- [ ] 3.2 Update `AGENTS.md` with the pack command, the frozen installed copy and the reinstall trigger, and replace every sentence that claims the plugin is installed from a link or that source edits reach the running plugin, and every instruction to re-enable `include:openspec-flow`, while keeping the `@deepseek-ai/*` rationale; verify the file names `npm run bundle:pack`, states the frozen behavior, and contains no claim that the current install is linked.
- [ ] 3.3 Add the frozen-reviewer paragraph to `docs/review.md` and verify `test/review-doc.test.mjs` asserts it.

## 4. Verification

- [ ] 4.1 On the committed clean tree run the pack command and verify `dist/dsh-openspec-flow-0.4.0.json` has `revision` equal to `git rev-parse HEAD` and `dirty: false`, and that `git status --short` lists no `dist/` file.
- [ ] 4.2 Run `openspec_inspect` with `action: "validate"` and `strict: true` and verify it passes.
- [ ] 4.3 Run `npm test` on Node 24 and verify it passes.
- [ ] 4.4 Run `npm run coverage:check` on Node 24 and verify it passes.
- [ ] 4.5 With the user, remove the installed bundle and install `dist/dsh-openspec-flow-0.4.0.tgz` in the Plugins page; verify the plugin row reports `0.4.0` with its package directory under the profile's `node_modules`, then edit a plugin source file and verify the plugin does not reload and the running reviewer keeps its installed version. Revert that source edit (or make it in a throwaway file outside the repository), verify `git status --short` is clean, and record which part the Host could not observe, if any.

## Workflow follow-up

- When new plugin logic must take effect, pack again, remove the bundle and install the new artifact; without an install the running plugin keeps its installed version.
