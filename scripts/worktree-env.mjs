#!/usr/bin/env node
/**
 * Repository-side development environment for apply worktrees.
 *
 * It resolves the main worktree, exports shared package/browser cache paths and
 * a per-worktree DSH home, and serializes Chromium preparation. It never reads
 * or writes plugin worktree state, review records, locks or landed manifests.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { findBrowserExecutable } from './lab/core/doctor.mjs'

/** Environment variable for an alternate shared root. */
export const SHARED_ROOT_ENV = 'OPENSPEC_FLOW_SHARED_ROOT'
/** The lock directory used by every Chromium preparation. */
export const INSTALL_LOCK_NAME = '.install.lock'
/** Default wait for a Chromium preparation lock. */
export const INSTALL_LOCK_TIMEOUT_MS = 10 * 60_000

/**
 * Run git with a working directory.
 * @param cwd - working directory.
 * @param args - git arguments.
 * @returns trimmed stdout, or undefined on failure.
 */
function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  if (result.status !== 0) return undefined
  return result.stdout.trim()
}

/**
 * The current worktree top level.
 * @param cwd - any directory inside the worktree.
 * @returns the absolute top level.
 * @throws when the directory is not inside a git worktree.
 */
export function currentWorktree(cwd = process.cwd()) {
  const value = git(cwd, ['rev-parse', '--show-toplevel'])
  if (value === undefined || value === '') {
    throw new Error(`cannot resolve the current worktree from ${cwd}: git rev-parse --show-toplevel named none`)
  }
  return value
}

/**
 * The main worktree of the repository, as git lists it first.
 * @param cwd - any directory inside a checkout.
 * @returns the absolute main worktree path.
 * @throws when git lists no worktree.
 */
export function mainWorktree(cwd = process.cwd()) {
  const value = git(cwd, ['worktree', 'list', '--porcelain'])
  if (value === undefined) {
    throw new Error(`cannot resolve the main worktree from ${cwd}: git worktree list failed`)
  }
  const line = value.split('\n').find((entry) => entry.startsWith('worktree '))
  if (line === undefined) throw new Error(`cannot resolve the main worktree from ${cwd}: git worktree list named none`)
  return line.slice('worktree '.length)
}

/**
 * Reject a shared root that is not an absolute usable path.
 * @param value - the override value.
 * @returns the value.
 */
export function assertAbsolutePath(value) {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`${SHARED_ROOT_ENV} must be a non-empty absolute path`)
  }
  if (/[\0\r\n]/u.test(value)) {
    throw new Error(`${SHARED_ROOT_ENV} must not contain NUL, CR or LF: ${JSON.stringify(value)}`)
  }
  if (!isAbsolute(value)) throw new Error(`${SHARED_ROOT_ENV} must be absolute: ${JSON.stringify(value)}`)
  return value
}

/**
 * Resolve the worktree environment.
 * @param options - cwd and environment.
 * @returns every exported path.
 */
export function resolveEnvironment({ cwd = process.cwd(), env = process.env } = {}) {
  const worktree = currentWorktree(cwd)
  const main = mainWorktree(cwd)
  const override = env[SHARED_ROOT_ENV]
  const sharedRoot = override === undefined || override === '' ? join(main, '.cache', 'openspec-flow', 'shared') : assertAbsolutePath(override)
  return {
    mainRoot: main,
    worktree,
    sharedRoot,
    npmCache: join(sharedRoot, 'npm'),
    pnpmStore: join(sharedRoot, 'pnpm-store'),
    browsersPath: join(sharedRoot, 'pw-browsers'),
    dshHome: join(worktree, '.cache', 'openspec-flow', 'dsh-home'),
    installLock: join(sharedRoot, INSTALL_LOCK_NAME),
  }
}

/**
 * Resolve a browser path from the environment.
 * @param options - lab or repository root, and environment.
 * @returns the absolute browser path.
 */
export function resolveBrowsersPath({ root = process.cwd(), env = process.env } = {}) {
  const value = env.PLAYWRIGHT_BROWSERS_PATH
  if (value === undefined || value.trim() === '') return join(root, '.cache', 'lab', 'pw-browsers')
  return isAbsolute(value) ? value : resolve(root, value)
}

/**
 * Resolve the npm cache from the environment.
 * @param options - fallback and environment.
 * @returns the cache path.
 */
export function resolveNpmCache({ fallback, env = process.env } = {}) {
  return env.LAB_NPM_CACHE ?? env.npm_config_cache ?? fallback
}

/** Quote one value for POSIX shell. */
function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

/**
 * Render shell exports.
 * @param environment - resolved environment.
 * @returns one export per line.
 */
export function renderPrint(environment) {
  return [
    `export OPENSPEC_FLOW_MAIN=${shellQuote(environment.mainRoot)}`,
    `export OPENSPEC_FLOW_SHARED=${shellQuote(environment.sharedRoot)}`,
    `export npm_config_cache=${shellQuote(environment.npmCache)}`,
    `export LAB_NPM_CACHE=${shellQuote(environment.npmCache)}`,
    `export PNPM_STORE_DIR=${shellQuote(environment.pnpmStore)}`,
    `export PLAYWRIGHT_BROWSERS_PATH=${shellQuote(environment.browsersPath)}`,
    `export DSH_HOME=${shellQuote(environment.dshHome)}`,
  ].join('\n')
}

/**
 * Render the environment as JSON.
 * @param environment - resolved environment.
 * @returns the JSON text.
 */
export function renderJson(environment) {
  return `${JSON.stringify(environment, null, 2)}\n`
}

/** The lock path for one browser directory. */
export function installLockPath(browsersPath) {
  return join(dirname(resolve(browsersPath)), INSTALL_LOCK_NAME)
}

/**
 * Whether a pid names a live process.
 * @param pid - process id.
 * @returns true when alive.
 */
export function processAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') return false
    if (error?.code === 'EPERM') return true
    throw error
  }
}

/** Read the owner text, or undefined. */
function readOwnerText(lockPath) {
  try {
    return readFileSync(join(lockPath, 'owner.json'), 'utf8')
  } catch {
    return undefined
  }
}

/**
 * Inspect one install lock without removing it.
 * @param lockPath - lock directory.
 * @param isAlive - liveness probe.
 * @returns `{ held, state, owner }`.
 */
export function inspectInstallLock(lockPath, isAlive = processAlive) {
  if (!existsSync(lockPath)) return { held: false, state: 'missing' }
  const text = readOwnerText(lockPath)
  if (text === undefined) return { held: true, state: 'unusable' }
  try {
    const owner = JSON.parse(text)
    if (!Number.isInteger(owner?.pid)) return { held: true, state: 'unusable', owner }
    return { held: true, state: isAlive(owner.pid) ? 'alive' : 'dead', owner }
  } catch {
    return { held: true, state: 'unusable' }
  }
}

let tokenCounter = 0

/**
 * Acquire the install lock synchronously.
 * @param lockPath - lock directory.
 * @param what - operation label.
 * @param options - timeout, poll, liveness and clock.
 * @returns a release handle.
 */
export function acquireInstallLockSync(lockPath, what, options = {}) {
  const {
    timeoutMs = INSTALL_LOCK_TIMEOUT_MS,
    pollMs = 100,
    now = Date.now,
    isAlive = processAlive,
    sleep = sleepSync,
  } = options
  const deadline = now() + timeoutMs
  mkdirSync(dirname(lockPath), { recursive: true })
  for (;;) {
    try {
      mkdirSync(lockPath)
      const token = `${String(process.pid)}-${now().toString(36)}-${String(++tokenCounter)}`
      const owner = { schema: 1, token, pid: process.pid, at: new Date(now()).toISOString(), what }
      writeFileSync(join(lockPath, 'owner.json'), `${JSON.stringify(owner)}\n`, { flag: 'wx' })
      return { lockPath, token }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
    }
    const text = readOwnerText(lockPath)
    const inspection = inspectInstallLock(lockPath, isAlive)
    if (inspection.state === 'dead') {
      const before = readOwnerText(lockPath)
      if (before === text) {
        rmSync(lockPath, { recursive: true, force: true })
        continue
      }
      continue
    }
    if (inspection.state === 'unusable') {
      let age = 0
      try {
        age = now() - statSync(lockPath).mtimeMs
      } catch {
        continue
      }
      if (age > 30 * 60_000) {
        const before = readOwnerText(lockPath)
        if (before === text) {
          rmSync(lockPath, { recursive: true, force: true })
          continue
        }
      }
    }
    if (now() >= deadline) {
      const owner = inspection.owner
      throw new Error(`timed out waiting for ${lockPath}${owner === undefined ? '' : ` held by pid ${String(owner.pid)} (${String(owner.what ?? 'unknown')})`}`)
    }
    sleep(pollMs)
  }
}

/** Release one install lock if this process still owns it. */
export function releaseInstallLock(handle) {
  const text = readOwnerText(handle.lockPath)
  if (text === undefined) return
  try {
    const owner = JSON.parse(text)
    if (owner?.token !== handle.token) return
  } catch {
    return
  }
  rmSync(handle.lockPath, { recursive: true, force: true })
}

/**
 * Run work while holding the install lock.
 * @param lockPath - lock directory.
 * @param what - operation label.
 * @param work - work to run.
 * @param options - acquisition options.
 * @returns the work result.
 */
export function withInstallLockSync(lockPath, what, work, options = {}) {
  const handle = acquireInstallLockSync(lockPath, what, options)
  try {
    return work()
  } finally {
    releaseInstallLock(handle)
  }
}

/** Sleep synchronously. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Install Chromium into one browser directory.
 * @param options - browser path, download host, cwd and spawn seam.
 * @returns nothing.
 */
export function installChromium({ browsersPath, host, cwd = process.cwd(), spawn = spawnSync } = {}) {
  const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath }
  if (host !== undefined) env.PLAYWRIGHT_DOWNLOAD_HOST = host
  const result = spawn('npx', ['playwright', 'install', 'chromium'], { cwd, env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`npx playwright install chromium exited ${String(result.status ?? 'unknown')}`)
}

/**
 * Refuse a browser directory that a reset must not remove.
 *
 * `--reset-browsers` deletes the directory recursively, so it may only touch a
 * browser cache this checkout owns: a directory inside the repository root,
 * such as the default `.cache/lab/pw-browsers`. `PLAYWRIGHT_BROWSERS_PATH` can
 * name a cache shared with other projects or with the host, and removing that
 * would delete browsers this repository does not own.
 * @param options - browser path and the repository root that bounds it.
 * @returns the resolved browser path when a reset may remove it.
 * @throws when the path is the repository root itself or lies outside it.
 */
export function assertResettableBrowsersPath({ browsersPath, root }) {
  const target = resolve(browsersPath)
  const repository = resolve(root)
  const relativePath = relative(repository, target)
  const inside = relativePath !== '' && relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath)
  if (inside) return target
  const where = relativePath === '' ? 'is the repository root itself' : `is outside the repository at ${repository}`
  throw new Error(
    `refusing to remove ${target}: --reset-browsers only removes a browser cache inside ${repository}, and ${target} ${where}. Remove that directory yourself, or run --reset-browsers with PLAYWRIGHT_BROWSERS_PATH unset to reset ${join(repository, '.cache', 'lab', 'pw-browsers')}.`,
  )
}

/**
 * Prepare Chromium under the shared lock.
 * @param options - browser path, reset flag, repository root, host, install seam and lock options.
 * @returns `{ installed, reused }`.
 */
export function prepareChromium({
  browsersPath,
  reset = false,
  root = process.cwd(),
  host,
  install = installChromium,
  cwd = process.cwd(),
  isAlive = processAlive,
  timeoutMs,
  pollMs,
} = {}) {
  if (reset) assertResettableBrowsersPath({ browsersPath, root })
  const lockPath = installLockPath(browsersPath)
  return withInstallLockSync(lockPath, 'chromium', () => {
    if (reset) rmSync(browsersPath, { recursive: true, force: true })
    if (!reset && findBrowserExecutable(browsersPath) !== undefined) return { installed: false, reused: true }
    install({ browsersPath, host, cwd })
    return { installed: true, reused: false }
  }, { ...(timeoutMs === undefined ? {} : { timeoutMs }), ...(pollMs === undefined ? {} : { pollMs }), isAlive })
}

/**
 * Create the shared directory layout.
 * @param options - environment and optional browser preparation.
 * @returns the environment.
 */
export function initEnvironment({ environment, browser = false, install = installChromium, host } = {}) {
  for (const directory of [environment.sharedRoot, environment.npmCache, environment.pnpmStore, environment.browsersPath, environment.dshHome]) {
    mkdirSync(directory, { recursive: true })
  }
  if (browser) prepareChromium({ browsersPath: environment.browsersPath, install, cwd: environment.worktree, host })
  return environment
}

/**
 * Check the environment without writing anything.
 * @param options - environment, inherited env and spawn seam.
 * @returns `{ ok, checks, errors, lock }`.
 */
export function checkEnvironment({ environment, env = process.env, spawn = spawnSync } = {}) {
  const checks = []
  const errors = []
  const requireDirectory = (label, directory) => {
    const exists = existsSync(directory) && statSync(directory).isDirectory()
    checks.push({ name: label, ok: exists, path: directory })
    if (!exists) errors.push(`${label} is missing at ${directory}; run \`node scripts/worktree-env.mjs init\``)
  }
  requireDirectory('shared root', environment.sharedRoot)
  requireDirectory('npm cache', environment.npmCache)
  requireDirectory('pnpm store', environment.pnpmStore)
  requireDirectory('browser directory', environment.browsersPath)
  requireDirectory('DSH home', environment.dshHome)
  const browser = findBrowserExecutable(environment.browsersPath)
  checks.push({ name: 'chromium executable', ok: browser !== undefined, path: browser })
  if (browser === undefined) errors.push(`no Chromium executable under ${environment.browsersPath}; run \`node scripts/worktree-env.mjs init --browser\``)
  if (env.DSH_HOME !== undefined && env.DSH_HOME !== '' && resolve(env.DSH_HOME) !== resolve(environment.dshHome)) {
    errors.push(`inherited DSH_HOME ${env.DSH_HOME} differs from the computed worktree home ${environment.dshHome}`)
  }
  const pnpm = spawn('pnpm', ['--version'], { encoding: 'utf8' })
  const pnpmVersion = pnpm.status === 0 ? pnpm.stdout.trim() : undefined
  checks.push({ name: 'pnpm', ok: pnpmVersion !== undefined, version: pnpmVersion })
  if (pnpmVersion === undefined) errors.push('pnpm is not available on PATH')
  const lock = inspectInstallLock(environment.installLock)
  checks.push({ name: 'install lock', ok: true, held: lock.held, state: lock.state, owner: lock.owner })
  return { ok: errors.length === 0, checks, errors, lock, environment }
}

/**
 * Parse one CLI action.
 * @param argv - process arguments.
 * @returns `{ action, browser, help }`.
 */
export function parseArgs(argv) {
  let action = 'print'
  let browser = false
  let help = false
  for (const arg of argv) {
    if (arg === '--help') help = true
    else if (arg === '--browser') browser = true
    else if (['print', 'json', 'check', 'init'].includes(arg)) action = arg
    else throw new Error(`unknown worktree-env option: ${arg}`)
  }
  return { action, browser, help }
}

const USAGE = `Usage: node scripts/worktree-env.mjs <print|json|check|init> [--browser]

print   print POSIX shell exports for the current worktree
json    print the resolved environment as JSON
check   diagnose the shared caches, browser and DSH home without writing
init    create the shared directories; --browser also installs Chromium under the lock
`

/** Entry point. */
function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(USAGE)
    return
  }
  const environment = resolveEnvironment()
  if (options.action === 'print') {
    process.stdout.write(`${renderPrint(environment)}\n`)
    return
  }
  if (options.action === 'json') {
    process.stdout.write(renderJson(environment))
    return
  }
  if (options.action === 'init') {
    initEnvironment({ environment, browser: options.browser })
    process.stdout.write(`worktree-env: initialized ${environment.sharedRoot}${options.browser ? ' and Chromium' : ''}\n`)
    return
  }
  const result = checkEnvironment({ environment })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`worktree-env: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
