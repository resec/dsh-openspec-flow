# DSH lab

The lab runs the packaged plugin in an isolated DSH and verifies behavior that source-level tests cannot cover: installation, bundle composition, headless events, the review-channel endpoints, the Web GUI and card rendering. It never installs, restarts or modifies the development host profile.

## Prerequisites

- Node 24 satisfying `engines.node`; the lab entrypoints use the repository preflight.
- The pinned DSH, installed from npm at the plugin's `engines.dsh` version. The first online run caches it under `.cache/lab/dsh/`; later runs reuse it.
- Playwright and its Chromium binary at `PLAYWRIGHT_BROWSERS_PATH` when set, otherwise `.cache/lab/pw-browsers`:

```sh
PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-.cache/lab/pw-browsers}" npx playwright install chromium
```

In an apply worktree, source the shared environment first; see [`apply-worktree-dev.md`](apply-worktree-dev.md).

- `pnpm` on `PATH` at the version pinned by the CI lab job. DSH forwards plugin installation to pnpm:

```sh
npm install --global pnpm@12.6.0
```

- A CJK font. The lab uses `.cache/lab/fontconfig/fonts.conf` when it exists and otherwise relies on the host font configuration. Without a CJK font the card labels render as boxes.

Run the preflight first:

```sh
npm run lab -- doctor
```

An absent DSH cache is reported as `will-install`, not as a failure. A missing pnpm, a missing browser binary, a broken browser library, a missing CJK font, a wrong Node version or insufficient disk fails.

## Commands

```sh
npm run lab -- doctor
npm run lab -- cache list
npm run lab -- cache verify
npm run lab -- cache prune
npm run lab -- cache rm <version>/<shape>

npm run lab -- up --name poc --mode web [--keep] [--fresh-dsh] [--offline]
npm run lab -- run [--plugin <tarball>] -- "task"
npm run lab -- exec --name poc -- --profile verify-web --dump-config
npm run lab -- inspect --name poc --all
npm run lab -- down --name poc

npm run test:lab -- [scenario paths...] [--mock-only] [--include-real-model] [--cleanup] [--keep]
```

`up --mode web` prints the startup URL and keeps the isolated web instance running until `down` or SIGINT. `up --mode headless` prepares an instance for `exec` but does not keep a process. `run` is the one-shot headless path and uses a fresh sandbox.

`test:lab` with no paths discovers every `test/lab/**/*.scenario.mjs`. There is no `--all` flag. The default is `--mock-only`; a real-model scenario is skipped unless `--include-real-model` is passed in an interactive local run. `--cleanup` removes the whole run directory after a pass; `--keep` keeps the isolated home, profile and project. A failure always keeps the full directory.

## Reusable scenarios

Put reusable scenarios under `test/lab/**/*.scenario.mjs`. The sample below is `test/lab/my-scenario.scenario.mjs`; a scenario in a deeper folder needs one `../` per extra level:

```js
import { defineScenario, expectCompleted } from '../../scripts/lab/index.mjs'

export default defineScenario({
  name: 'my-scenario',
  model: 'mock',
  async run(lab) {
    const run = await lab.headless.run({ prompt: '...' })
    expectCompleted(run)

    const web = await lab.web.open()
    await web.dismissOnboarding()
    await web.chooseWorkspace(lab.run.project)
    await web.send('hello')
    await web.expectText('Mock reply from the isolated lab.')
  },
})
```

The plain test entrypoint only collects top-level `test/*.test.mjs`, so `test/lab/**/*.scenario.mjs` does not slow down `npm test` or `test:affected`. Framework unit tests live at `test/lab-*.test.mjs` and do run in `npm test`.

## POCs

One-off experiments belong under `.cache/lab/experiments/`. They are ignored by git, never discovered by `test:lab` and never part of pre-push. Import the lab API directly or call the CLI; the isolated home is the only state they touch.

```js
// .cache/lab/experiments/example.mjs
import { createLab, expectCompleted } from '../../../scripts/lab/index.mjs'
import { packPlugin } from '../../../scripts/lab/core/install.mjs'

const plugin = packPlugin({ outDir: '.cache/lab/tarballs/poc' })
const lab = await createLab({ pluginTarball: plugin, keep: true })
try {
  const run = await lab.headless.run({ prompt: 'Reply with one short sentence.' })
  expectCompleted(run)
  console.log(lab.run.dir)
} finally {
  await lab.close({ passed: true, keep: true })
}
```

## Remote lab and pre-push

The remote `lab` CI job is the lab gate for pull requests and `main`; it runs the same `npm run test:lab -- --mock-only` scenarios. The local pre-push hook no longer runs them: it runs strict OpenSpec validation, then the coverage stamp or `npm run verify`. `COVERAGE_SKIP=1` skips only coverage.

The offline maintainer path has no remote CI before its deferred push, so it runs `npm run test:lab -- --mock-only` locally before the local land. A missing prerequisite is a gate failure, not a reason to skip the gate.

## Artifacts

Each run writes under `.cache/lab/runs/<id>/artifacts/`:

- `report.json` — versions, cache source, plugin sha512 and dirty paths, checks, verdict and evidence paths
- `manifest.json` — DSH and run metadata
- one `dump-config-<mode>.yml` per composed profile, `headless.ndjson`, `headless.stderr.log`, `web.log`, `mock.log`
- `init-<mode>.log` — the untouched output of a profile initialization that failed; the failure message names it
- copied session logs, card files and screenshots

The invocation's scenario summary, including skipped real-model scenarios, is written to `.cache/lab/reports/<id>.json`.

Reports never contain tokens, cookies or API keys. Before the default post-pass cleanup removes the isolated home, sessions and cards are copied into `artifacts/`, so every evidence path survives.

## Cache

Entries live under `.cache/lab/dsh/<version>/<node-major>-<platform>-<arch>/`. An entry is installed in a temporary directory, verified with `--version`, marked `.complete` and renamed under a lock. `--fresh-dsh` installs a temporary DSH for that run; `--offline` uses only the cache and refuses to download. The two flags cannot be combined.

The pnpm store is chosen by pnpm and may be shared with the host; the report records the actual store path. npm uses `OPENSPEC_FLOW_NPM_CACHE` when set, otherwise `.cache/lab/cache/npm`; the `npm_config_cache` that npm exports to scripts no longer selects the cache, so only an explicit `OPENSPEC_FLOW_NPM_CACHE` can point the lab outside the workspace. The apply worktree environment exports the shared npm cache and a per-worktree `DSH_HOME`; see [`apply-worktree-dev.md`](apply-worktree-dev.md).
