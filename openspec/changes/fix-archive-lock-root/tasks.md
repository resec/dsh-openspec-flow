# Tasks

## 1. Resolve the archive gate root like apply

- [x] 1.1 Import `implementationRootOf` in `lib/tools/review.js`.
- [x] 1.2 Use it for the archive lock domain, keeping `mainWorktreeRoot` for the
      worktree-enabled path.

## 2. Guard the roots

- [x] 2.1 Allow `setup` to run from a subdirectory through `options.cwd`.
- [x] 2.2 Assert a non-git project at `<root>/pkg` refuses the second change's
      archive and names the holder.
- [x] 2.3 Assert the worktree-disabled git path and the git worktree path keep
      resolving their lock roots.
- [x] 2.4 Confirm the non-git assertion fails with the implementation reverted.

## 3. Verify

- [x] 3.1 Run `node --test test/review-serial.test.mjs`.
- [x] 3.2 Run `/tmp/b3/gates.sh fix-archive-lock-root`.
