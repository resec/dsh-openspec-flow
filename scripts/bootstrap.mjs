#!/usr/bin/env node
/**
 * Development bootstrap after a Node 24 runtime exists.
 *
 * The shell entrypoint owns runtime discovery and the download fallback; this
 * module installs the clone's development dependencies and verifies the gate.
 * It never writes tracked files, shell configuration or DSH profiles.
 */

import { existsSync, realpathSync, statfsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertCurrentNode } from './node-version.mjs'
import { MIN_FREE_BYTES } from './bootstrap-lib.mjs'
import { prepareChromium, resolveBrowsersPath } from './worktree-env.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Resolve the npm cache for bootstrap.
 *
 * The ambient `npm_config_cache` is ignored: npm exports it to every lifecycle
 * script and it names the host home cache, which a workspace-write sandbox
 * cannot write. `OPENSPEC_FLOW_NPM_CACHE` is the explicit override.
 * @param options - environment.
 * @returns the cache path.
 */
export function resolveNpmCache({ env = process.env } = {}) {
  return env.OPENSPEC_FLOW_NPM_CACHE ?? join(ROOT, '.cache', 'npm')
}

const NPM_CACHE = resolveNpmCache()

/**
 * Resolve the browser path bootstrap uses for this run.
 * @param env - environment to resolve.
 * @returns the absolute browser path.
 */
export function browsersPath(env = process.env) {
  return resolveBrowsersPath({ root: ROOT, env })
}

const BROWSERS_PATH = browsersPath()

const USAGE = `Usage: scripts/bootstrap.sh [options]

Options:
  --full                 Run npm run verify and npm run test:lab -- --mock-only instead of the plain suite.
  --skip-test            Skip npm test.
  --skip-install         Reuse node_modules instead of running npm ci.
  --skip-playwright      Skip the Playwright Chromium installation.
  --playwright-host URL  Chromium download host (PLAYWRIGHT_DOWNLOAD_HOST).
  --reset-browsers       Remove .cache/lab/pw-browsers before installing Chromium.
  --force                Continue past the free-disk threshold.
  --registry URL         npm registry for npm ci and npx.
  --help                 Show this usage and exit.

Environment: OPENSPEC_FLOW_NPM_CACHE selects the npm cache (default
.cache/npm); an exported npm_config_cache is ignored; PLAYWRIGHT_BROWSERS_PATH
selects the Chromium directory.

The script never edits shell rc files, global Git configuration or DSH
profiles, and never runs the CLI's init or update commands.
`

/**
 * Parse the bootstrap options.
 * @param argv - process arguments after the script name.
 * @returns parsed options.
 */
export function parseBootstrapArgs(argv) {
  const options = {
    full: false,
    skipTest: false,
    skipInstall: false,
    skipPlaywright: false,
    playwrightHost: undefined,
    resetBrowsers: false,
    force: false,
    registry: undefined,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--full': options.full = true; break
      case '--skip-test': options.skipTest = true; break
      case '--skip-install': options.skipInstall = true; break
      case '--skip-playwright': options.skipPlaywright = true; break
      case '--reset-browsers': options.resetBrowsers = true; break
      case '--force': options.force = true; break
      case '--help': options.help = true; break
      case '--playwright-host': {
        const value = argv[index + 1]
        if (value === undefined || value.startsWith('--')) throw new Error('--playwright-host needs a value')
        options.playwrightHost = value
        index += 1
        break
      }
      case '--registry': {
        const value = argv[index + 1]
        if (value === undefined) throw new Error('--registry needs a value')
        options.registry = value
        index += 1
        break
      }
      default:
        throw new Error(`unknown bootstrap option: ${arg}`)
    }
  }
  if (options.resetBrowsers && options.skipPlaywright) {
    throw new Error('--reset-browsers cannot be combined with --skip-playwright')
  }
  return options
}

/**
 * Build the step plan for one bootstrap run.
 * @param options - parsed bootstrap options.
 * @param state - the `dependenciesPresent` observation.
 * @returns the booleans that decide each step, plus the dependency refusal.
 */
export function resolvePlan(options, state) {
  const dependenciesPresent = state?.dependenciesPresent === true
  return {
    install: options.skipInstall !== true,
    doctor: true,
    plainTest: options.skipTest !== true && options.full !== true,
    verification: options.full === true,
    lab: options.full === true,
    missingDependencies: options.skipInstall === true && !dependenciesPresent,
  }
}

/**
 * Environment additions for the Chromium installer.
 * @param host - optional download host.
 * @returns the environment fragment.
 */
export function playwrightEnv(host) {
  return host === undefined ? {} : { PLAYWRIGHT_DOWNLOAD_HOST: host }
}

/**
 * Environment additions for bootstrap's npm children.
 *
 * Both selectors carry the same directory so `npm ci`, `npm run verify` and
 * `npm run test:lab` cannot resolve different caches.
 * @param options - resolved cache and optional registry.
 * @returns the environment fragment.
 */
export function npmEnvFor({ cache = NPM_CACHE, registry } = {}) {
  return {
    npm_config_cache: cache,
    OPENSPEC_FLOW_NPM_CACHE: cache,
    ...(registry === undefined ? {} : { npm_config_registry: registry }),
  }
}

/**
 * Run the Chromium preparation step, including the download-host option.
 * @param options - parsed bootstrap options.
 * @param overrides - browser path, npm environment and install seam.
 * @returns `{ installed, reused }`.
 */
export function runBrowserStep(options, { browsersPath: path = BROWSERS_PATH, npmEnv = {}, install, lockOptions = {} } = {}) {
  const prepare = install ?? (({ browsersPath: browser, host }) => run('npx', ['playwright', 'install', 'chromium'], {
    ...npmEnv,
    ...playwrightEnv(host),
    PLAYWRIGHT_BROWSERS_PATH: browser,
  }))
  return prepareChromium({
    browsersPath: path,
    reset: options.resetBrowsers,
    host: options.playwrightHost,
    cwd: ROOT,
    install: prepare,
    ...lockOptions,
  })
}

/**
 * Message used when `--skip-install` finds no dependencies.
 * @returns the correction-oriented message.
 */
export function dependenciesError() {
  return '--skip-install needs the dependencies installed under node_modules; run npm ci first'
}

/**
 * Closing hint that names the DSH cache and its cleanup command.
 * @returns the hint line.
 */
export function completionHint() {
  return 'lab cache: .cache/lab/dsh; reclaim stale DSH installs with npm run lab -- cache prune'
}

function log(step, total, message) {
  console.log(`bootstrap [${step}/${total}] ${message}`)
}

/**
 * Run one child process, failing the bootstrap on a nonzero exit.
 * @param command - executable.
 * @param args - arguments.
 * @param env - environment additions.
 */
function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status ?? 'unknown'}`)
}

function freeBytes(path) {
  const stats = statfsSync(path)
  return Number(stats.bavail) * Number(stats.bsize)
}

function main() {
  const options = parseBootstrapArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(USAGE)
    return
  }

  assertCurrentNode()

  const free = freeBytes(ROOT)
  if (free < MIN_FREE_BYTES && !options.force) {
    throw new Error(
      `bootstrap needs at least ${Math.round(MIN_FREE_BYTES / 1024 / 1024)} MiB free under ${ROOT}; ${Math.round(free / 1024 / 1024)} MiB available (use --force to continue)`,
    )
  }

  const npmEnv = npmEnvFor({ cache: NPM_CACHE, registry: options.registry })
  const total = options.full ? 7 : 5
  const plan = resolvePlan(options, {
    dependenciesPresent: existsSync(join(ROOT, 'node_modules')),
  })
  if (plan.missingDependencies) throw new Error(dependenciesError())

  if (plan.install) {
    log(1, total, 'installing locked dependencies')
    run('npm', ['ci'], npmEnv)
  } else {
    log(1, total, 'dependencies reused')
  }

  log(2, total, 'installing Git hooks')
  run('npm', ['run', 'hooks:install'], npmEnv)

  if (options.skipPlaywright) {
    log(3, total, 'Playwright Chromium skipped')
  } else {
    const prepared = runBrowserStep(options, { npmEnv })
    log(3, total, prepared.installed ? 'installed Playwright Chromium' : 'Playwright Chromium already present')
  }

  const labEnv = { PLAYWRIGHT_BROWSERS_PATH: BROWSERS_PATH, ...npmEnv }
  log(4, total, 'checking the lab prerequisites')
  run('npm', ['run', 'lab', '--', 'doctor'], labEnv)

  if (plan.plainTest) {
    log(5, total, 'running the test suite')
    run('npm', ['test'], npmEnv)
  } else {
    log(5, total, options.full ? 'plain test suite skipped; verification runs the suite' : 'test suite skipped')
  }

  if (plan.verification) {
    log(6, total, 'running verification')
    run('npm', ['run', 'verify'], npmEnv)
  }

  if (plan.lab) {
    log(7, total, 'running the reusable lab scenarios')
    run('npm', ['run', 'test:lab', '--', '--mock-only'], labEnv)
  }

  console.log('bootstrap: ready')
  console.log(completionHint())
  console.log('Next: source scripts/activate.sh to use a clone-local runtime, then npm run verify.')
}

/**
 * Whether this module is the script the process was started with.
 *
 * `import.meta.url` is the real path while `process.argv[1]` keeps the spelling
 * the caller used, so a symlinked invocation is resolved on the argv side
 * before the comparison and never silently skips the run.
 * @returns true when the module is the entry point.
 */
function isEntryPoint() {
  if (process.argv[1] === undefined) return false
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href
  }
}

if (isEntryPoint()) {
  try {
    main()
  } catch (error) {
    console.error(`bootstrap: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
