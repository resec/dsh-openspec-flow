#!/usr/bin/env node
/**
 * Development bootstrap after a Node 24 runtime exists.
 *
 * The shell entrypoint owns runtime discovery and the download fallback; this
 * module installs the clone's development dependencies and verifies the gate.
 * It never writes tracked files, shell configuration or DSH profiles.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statfsSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertCurrentNode, readNodeRequirements } from './node-version.mjs'
import { MIN_FREE_BYTES } from './bootstrap-lib.mjs'
import { installChromium, installLockPath, prepareChromium, resolveEnvironment, withInstallLockSync } from './worktree-env.mjs'
import {
  PNPM_VERSION,
  buildRecord,
  chromiumBucket,
  pnpmBucket,
  readChromiumRevisions,
  readRecord,
  resolvePlaywrightVersion,
  writeRecord,
} from './toolchain.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ENVIRONMENT = resolveEnvironment({ cwd: ROOT })
const SHARED = process.env.OPENSPEC_FLOW_SHARED_ROOT ?? ENVIRONMENT.sharedRoot

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
export function browsersPath(env = process.env, { root = ROOT, sharedRoot = SHARED } = {}) {
  const value = env.PLAYWRIGHT_BROWSERS_PATH
  if (value !== undefined && value.trim() !== '') return isAbsolute(value) ? value : resolve(root, value)
  return chromiumBucket(sharedRoot, resolvePlaywrightVersion(root))
}

const USAGE = `Usage: scripts/bootstrap.sh [options]

Options:
  --full                 Run npm run verify and npm run test:lab -- --mock-only instead of the plain suite.
  --skip-test            Skip npm test.
  --skip-install         Reuse node_modules instead of running npm ci.
  --skip-playwright      Skip the Playwright Chromium installation.
  --playwright-host URL  Chromium download host (PLAYWRIGHT_DOWNLOAD_HOST).
  --reset-browsers       Remove the current Playwright browser bucket before installing Chromium.
  --deps-only            Prepare tools, dependencies, Chromium and the record; skip hooks, the doctor and tests.
  --no-gc               Skip bucket collection.
  --gc-dry-run          Report buckets collection would delete without deleting them.
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
    depsOnly: process.env.OPENSPEC_FLOW_DEPS_ONLY === '1',
    noGc: false,
    gcDryRun: false,
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
      case '--deps-only': options.depsOnly = true; break
      case '--no-gc': options.noGc = true; break
      case '--gc-dry-run': options.gcDryRun = true; break
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
  const depsOnly = options.depsOnly === true
  return {
    install: depsOnly ? options.skipInstall !== true && !dependenciesPresent : options.skipInstall !== true,
    doctor: !depsOnly,
    plainTest: !depsOnly && options.skipTest !== true && options.full !== true,
    verification: !depsOnly && options.full === true,
    lab: !depsOnly && options.full === true,
    chromium: options.skipPlaywright !== true,
    record: true,
    gc: true,
    depsOnly,
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
export function runBrowserStep(options, { browsersPath: path = browsersPath(), npmEnv = {}, install, lockOptions = {} } = {}) {
  const prepare = install ?? (({ browsersPath: browser, host }) => installChromium({
    browsersPath: browser,
    host,
    cwd: ROOT,
  }))
  return prepareChromium({
    browsersPath: path,
    reset: options.resetBrowsers,
    host: options.playwrightHost,
    cwd: ROOT,
    install: prepare,
    requireMarker: true,
    writeMarker: true,
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

function npmInfo() {
  const path = process.env.npm_execpath ?? join(dirname(process.execPath), 'npm')
  const result = spawnSync('npm', ['--version'], { encoding: 'utf8' })
  const version = result.status === 0 ? result.stdout.trim() : ''
  return { path, version }
}

/**
 * Prepare the pinned pnpm bucket and return the recorded paths.
 * @param options - npm environment.
 * @returns the pnpm record fields.
 */
export function ensurePnpmBucket({ npmEnv = {}, sharedRoot = SHARED, install } = {}) {
  const bucket = pnpmBucket(sharedRoot)
  const js = join(bucket, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
  const binDir = join(bucket, 'node_modules', '.bin')
  const marker = join(bucket, '.complete.json')
  const lockPath = installLockPath(bucket)
  return withInstallLockSync(lockPath, 'the pnpm bucket', () => {
    if (existsSync(marker) && existsSync(js)) {
      const check = spawnSync(process.execPath, [js, '--version'], { encoding: 'utf8' })
      if (check.status === 0 && check.stdout.trim() === PNPM_VERSION) {
        return { bucket, version: PNPM_VERSION, js, binDir, node: process.execPath }
      }
    }
    rmSync(bucket, { recursive: true, force: true })
    mkdirSync(bucket, { recursive: true })
    const doInstall = install ?? (() => run('npm', ['install', '--prefix', bucket, `pnpm@${PNPM_VERSION}`, '--no-audit', '--no-fund'], npmEnv))
    doInstall()
    const check = spawnSync(process.execPath, [js, '--version'], { encoding: 'utf8' })
    if (check.status !== 0 || check.stdout.trim() !== PNPM_VERSION) {
      throw new Error(`the pnpm bucket at ${bucket} reports ${JSON.stringify((check.stdout ?? '').trim())}; expected ${PNPM_VERSION}`)
    }
    writeFileSync(marker, `${JSON.stringify({ version: PNPM_VERSION, installedAt: new Date().toISOString() })}\n`)
    return { bucket, version: PNPM_VERSION, js, binDir, node: process.execPath }
  })
}

/**
 * Write this worktree's toolchain record.
 * @param options - pnpm fields and optional Chromium fields.
 * @returns the record path.
 */
export function writeToolchainRecord({ pnpm, chromium = null, root = ROOT, nodeSource = process.env.OPENSPEC_FLOW_NODE_SOURCE } = {}) {
  const requirements = readNodeRequirements(root)
  const record = buildRecord({
    root,
    requirements: {
      nodeRange: requirements.range,
      primaryNodeMajor: requirements.primaryMajor,
      pnpm: PNPM_VERSION,
    },
    node: {
      path: process.execPath,
      version: process.version,
      source: nodeSource === 'bucket' ? 'bucket' : 'host',
    },
    npm: npmInfo(),
    pnpm,
    chromium,
  })
  return writeRecord(root, record)
}

/**
 * Read the Chromium record fields for the prepared bucket.
 * @returns the Chromium fields.
 */
export function chromiumRecordFields({ root = ROOT, sharedRoot = SHARED, env = process.env } = {}) {
  const playwrightVersion = resolvePlaywrightVersion(root)
  return {
    playwrightVersion,
    browsersPath: browsersPath(env, { root, sharedRoot }),
    revisions: readChromiumRevisions(root),
  }
}

function worktreeRoots(mainRoot) {
  const result = spawnSync('git', ['-C', mainRoot, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git worktree list failed: ${(result.stderr ?? '').trim()}`)
  return result.stdout
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))
}

/**
 * Delete unreferenced buckets older than one hour.
 * @param options - dry-run flag.
 * @returns the number of buckets considered.
 */
export function collectBuckets({ dryRun = false, now = Date.now(), mainRoot = ENVIRONMENT.mainRoot, sharedRoot = SHARED } = {}) {
  const referenced = new Set()
  for (const worktree of worktreeRoots(mainRoot)) {
    if (!existsSync(worktree)) {
      console.error(`bootstrap: collection: missing worktree ${worktree}`)
      continue
    }
    const result = readRecord(worktree)
    if (result.state === 'invalid') {
      throw new Error(`the worktree record at ${worktree} cannot be read: ${result.reasons.join('; ')}`)
    }
    if (result.state === 'absent') continue
    const record = result.record
    const paths = [
      record.node?.source === 'bucket' ? record.node.path : undefined,
      record.pnpm?.bucket,
      record.chromium?.browsersPath,
    ]
    for (const path of paths) {
      if (typeof path === 'string' && path !== '') referenced.add(resolve(path))
    }
  }
  const candidates = []
  for (const directory of [
    join(sharedRoot, 'toolchain', 'node'),
    join(sharedRoot, 'toolchain', 'pnpm'),
    join(sharedRoot, 'browsers'),
  ]) {
    if (!existsSync(directory)) continue
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) candidates.push(join(directory, entry.name))
    }
  }
  let deleted = 0
  for (const bucket of candidates) {
    const real = resolve(bucket)
    if ([...referenced].some((path) => path === real || path.startsWith(`${real}/`))) continue
    if (existsSync(installLockPath(bucket))) continue
    if (now - statSync(bucket).mtimeMs < 60 * 60_000) continue
    if (dryRun) {
      console.log(`bootstrap: collection would delete ${bucket}`)
      continue
    }
    rmSync(bucket, { recursive: true, force: true })
    deleted += 1
    console.log(`bootstrap: collection deleted ${bucket}`)
  }
  console.log(`bootstrap: collection ${dryRun ? 'dry run' : 'done'}; deleted ${deleted}`)
  return candidates.length
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
  const plan = resolvePlan(options, {
    dependenciesPresent: existsSync(join(ROOT, 'node_modules')),
  })
  if (plan.missingDependencies) throw new Error(dependenciesError())

  let step = 0
  const total = plan.depsOnly ? 4 : options.full ? 8 : 7
  const next = (message) => {
    step += 1
    log(step, total, message)
  }

  next('preparing the pnpm bucket')
  const pnpm = ensurePnpmBucket({ npmEnv })

  if (plan.install) {
    next('installing locked dependencies')
    run('npm', ['ci'], npmEnv)
  } else {
    next('dependencies reused')
  }

  if (!plan.depsOnly) {
    next('installing Git hooks')
    run('npm', ['run', 'hooks:install'], npmEnv)
  }

  let chromium = null
  if (plan.chromium) {
    const prepared = runBrowserStep(options, { npmEnv })
    chromium = chromiumRecordFields()
    next(prepared.installed ? 'installed Playwright Chromium' : 'Playwright Chromium already present')
  }

  const path = writeToolchainRecord({ pnpm, chromium })
  next(`wrote ${path}`)

  if (plan.gc && !options.noGc) {
    try {
      collectBuckets({ dryRun: options.gcDryRun })
    } catch (error) {
      console.error(`bootstrap: bucket collection aborted: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const labEnv = () => ({ PLAYWRIGHT_BROWSERS_PATH: browsersPath(), ...npmEnv })
  if (plan.doctor) {
    next('checking the lab prerequisites')
    run('npm', ['run', 'lab', '--', 'doctor'], labEnv())
  }

  if (plan.plainTest) {
    next('running the test suite')
    run('npm', ['test'], npmEnv)
  }

  if (plan.verification) {
    next('running verification')
    run('npm', ['run', 'verify'], npmEnv)
  }

  if (plan.lab) {
    next('running the reusable lab scenarios')
    run('npm', ['run', 'test:lab', '--', '--mock-only'], labEnv())
  }

  console.log('bootstrap: ready')
  console.log(completionHint())
  console.log('Next: source scripts/activate.sh to use the recorded toolchain, then npm run verify.')
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
