# Tasks

## 1. Describe the browser reset as it behaves

- [x] 1.1 Rewrite the `--reset-browsers` line in the `scripts/bootstrap.sh` usage text.
- [x] 1.2 Rewrite the same line in the `scripts/bootstrap.mjs` usage text.
- [x] 1.3 Align the `CONTRIBUTING.md` option list with both help texts.

## 2. Make the closing hint conditional

- [x] 2.1 Add an exported closing-hint function that checks `.cache/toolchain/node/bin/node`.
- [x] 2.2 Print it after `bootstrap: ready` instead of the unconditional activate step.

## 3. Guard both texts

- [x] 3.1 Assert the resolved-directory wording in both help texts and `CONTRIBUTING.md`.
- [x] 3.2 Assert the host-runtime closing hint does not present `source scripts/activate.sh`.
- [x] 3.3 Confirm the new assertions fail against the previous texts and hint.

## 4. Verify

- [x] 4.1 Run `node --test test/bootstrap.test.mjs test/contributor-docs.test.mjs`.
- [x] 4.2 Run `/tmp/b3/gates.sh fix-bootstrap-texts`.
