# Tasks

## 1. Read the published set from tracked files

- [x] 1.1 Make `corePaths` and `expectedPublishedPaths` take the paths `git ls-files` lists and drop the directory walk.
- [x] 1.2 Run `git ls-files -z` in `lib/pack.js` and pass the result to both.

## 2. Record the dirty flag

- [x] 2.1 Add `untrackedPaths` and let `metadataFor` and `publishVerified` record whether the tarball carries an untracked path.
- [x] 2.2 Report those paths from the entrypoint; keep the dirty-tree refusal and `--force` unchanged.

## 3. Guard the behaviour

- [x] 3.1 Assert in `test/bundle.test.mjs` that an ignored and an untracked file stay out of the core set and that npm's real tarball passes `verifyTarball`.
- [x] 3.2 Assert in `test/pack.test.mjs` that an ignored file sets `dirty` true and that a clean tree and `.DS_Store` files leave it false.
- [x] 3.3 Confirm the new assertions fail with `lib/bundle.js` and `lib/pack.js` back at `main`.

## 4. Verify

- [x] 4.1 Run `node --test test/bundle.test.mjs test/pack.test.mjs`.
- [x] 4.2 Run `openspec validate fix-bundle-dirty-and-core-set --strict`, `npm run openspec:check`, `npm run layout:check`, `npm run check:pr` and `npm run verify`.
