# Proposal

## Why

Both help texts and one lab paragraph still say `--reset-browsers` removes
`.cache/lab/pw-browsers`, while the option removes the resolved browser
directory. That wording hides the case that matters: with
`PLAYWRIGHT_BROWSERS_PATH` set, the reset targets that path, and a reset only
touches a directory inside the repository.

The closing hint always says `source scripts/activate.sh`, but the script
returns `no clone-local Node runtime` whenever bootstrap used a host runtime, so
the advice fails for the run that just finished.

## What Changes

- Describe `--reset-browsers` as removing the resolved browser directory
  (`PLAYWRIGHT_BROWSERS_PATH` or `.cache/lab/pw-browsers`), only when it is
  inside the repository, in `scripts/bootstrap.sh`, `scripts/bootstrap.mjs` and
  `CONTRIBUTING.md`.
- Print the activate step only when `.cache/toolchain/node/bin/node` exists;
  otherwise close with the host-runtime wording and the conditional advice that
  `CONTRIBUTING.md` already uses.
- Assert both texts in `test/bootstrap.test.mjs`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contributor-workflow`: adds a requirement for the closing hint naming the
  activate step only when a clone-local runtime exists. The browser-reset
  wording needs no delta: the existing requirement already names the resolved
  browser directory, so only the texts had fallen behind it.

## Impact

- `scripts/bootstrap.sh`, `scripts/bootstrap.mjs`: usage text and one exported
  hint function.
- `CONTRIBUTING.md`: the `--reset-browsers` option line.
- `test/bootstrap.test.mjs`: help-text and closing-hint assertions.
- No behavior change for the reset itself, no dependency, hook, coverage
  baseline or `dist/` change.
