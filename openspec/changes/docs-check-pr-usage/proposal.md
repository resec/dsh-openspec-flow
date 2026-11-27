## Why

`npm run check:pr` is the local form of the pull-request change gate, but it is defined only in `package.json` and described nowhere a contributor reads. Running it without `--base` prints the usage line and exits with status 2, so the first attempt tells a contributor nothing about what the gate checks or which commit to pass. `CONTRIBUTING.md` lists every other local check; this one is missing.

## What Changes

- Add a "Pull-request change check" subsection under "Local checks and evidence" that names what the gate verifies: exactly one active change, no unchecked task in its `tasks.md`, no restricted path, and no dependency, engine or package-manager field change in `package.json`.
- Show the typical local invocation `npm run check:pr -- --base origin/main`, note that `--head` defaults to `HEAD`, and state that CI passes the pull request's `base.sha` and `head.sha`.
- State the exit status a bare invocation returns so it is not mistaken for a pass.
- Extend `test/contributor-docs.test.mjs` to pin the command and its `--base` usage, and to fail when a documented `npm run <script>` does not exist in `package.json`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The gate already behaves as documented; only its documentation is missing, so this change sets `skip_specs: true`.

## Impact

- `CONTRIBUTING.md`: one subsection under "Local checks and evidence".
- `test/contributor-docs.test.mjs`: two tests.
- No code, script, dependency, workflow, hook, coverage-baseline or `dist/` change.
