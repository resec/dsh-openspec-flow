# Tasks

## 1. Guard the reset

- [x] 1.1 Add `assertResettableBrowsersPath` to `scripts/worktree-env.mjs`: accept a path inside the repository root, refuse the root itself and any path outside it, and name the path, the reason and the manual cleanup in the error.
- [x] 1.2 Call the guard in `prepareChromium` before the install lock and the deletion, and pass `root` from bootstrap's `runBrowserStep`.
- [x] 1.3 Check the resolved path in `main` before the install steps, so a refused `--reset-browsers` exits nonzero without running `npm ci`.

## 2. Cover the behavior

- [x] 2.1 Assert the guard accepts the default `.cache/lab/pw-browsers` and refuses a shared directory and the repository root.
- [x] 2.2 Assert a refused reset leaves the shared browsers and writes no lock, and that the existing in-repository reset still deletes and reinstalls.
- [x] 2.3 Assert `runBrowserStep` refuses a shared path and that `bootstrap.mjs --reset-browsers` with `PLAYWRIGHT_BROWSERS_PATH` outside the repository exits 1 with the refusal.
- [x] 2.4 Confirm the new assertions fail against the previous implementation.
- [x] 2.5 State the confinement and the refusal in `docs/apply-worktree-dev.md` and `CONTRIBUTING.md`.

## 3. Verify

- [x] 3.1 Run `node --test test/worktree-env.test.mjs test/bootstrap.test.mjs`.
- [x] 3.2 Run `node --test test/contributor-docs.test.mjs test/lab-doc.test.mjs`.
- [x] 3.3 Run `/tmp/b3/gates.sh fix-reset-browsers-guard` from the clone root.
