# Decouple the eval harness from the plugin repository layout

## Why

The eval harness derives the tested plugin root from its own location (`eval/lib/../..`) and links that path into the generated headless profile. The coupling prevents testing a plugin checkout elsewhere, makes moving `eval/` to its own repository a code rewrite rather than a directory move, and leaves every run record without the plugin commit it measured. Those limits block the intended split into an independently evolving evaluation repository.

## What Changes

- Add a plugin-source resolver with this precedence: `--plugin-root`, `EVAL_PLUGIN_ROOT`, a sibling `../dsh-openspec-flow` checkout, then the current repository root. The current repository root remains the default, so existing single-repository usage is unchanged.
- Add an explicit clone fallback: when no local root resolves, `--clone` clones `git@github.com:resec/dsh-openspec-flow.git` into `eval/.plugin/` and checks out `--plugin-ref` (default `main`).
- Validate every resolved root by package name and, for a git checkout, by commit reachability for each real fixture base.
- Resolve the OpenSpec CLI from the harness's own dependency tree instead of the tested plugin's `node_modules`.
- Load `installSkills` from the resolved root, and use the resolved root for fixture `git archive` and for the fixture node_modules source.
- Record `{root, version, commit, dirty}` in each run record and surface it in the report.
- Leave the plugin runtime, tools, skills, policy and package dependencies unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `evaluation-harness`: adds a "Configurable plugin source" requirement covering resolution precedence, root validation, clone fallback, and per-run plugin provenance.

## Impact

- New: `eval/lib/plugin.mjs`, `eval/test/eval-plugin.test.mjs`.
- Changed: `eval/lib/paths.mjs`, `eval/lib/config.mjs`, `eval/lib/matrix.mjs`, `eval/lib/dsh-home.mjs`, `eval/lib/fixtures.mjs`, `eval/lib/verify.mjs`, `eval/lib/profile.mjs`, `eval/run.mjs`, affected `eval/test/*.test.mjs`, `eval/README.md`, `AGENTS.md`.
- Unchanged: `lib/`, `index.js`, `skills/`, `package.json` dependencies, and the shipped plugin bundle.
- Environment: real runs still require the pinned OpenSpec CLI, a `dsh` launcher, and stored credentials; the clone fallback additionally requires network access and GitHub credentials.
