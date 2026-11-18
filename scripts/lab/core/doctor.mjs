/**
 * The lab doctor: one place that says whether this machine can run a lab.
 *
 * An absent DSH cache is an informational "will install" state, because the
 * first online run is expected to populate it. Every other missing
 * prerequisite fails before a DSH process starts.
 */

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { BROWSERS_PATH, LAB_ROOT, ROOT } from './paths.mjs'
import { readPackage } from './paths.mjs'
import { dshVersion, listCache } from './cache.mjs'
import { run } from './process.mjs'
import { assertCurrentNode } from '../../node-version.mjs'

/** Minimum free space the lab accepts. */
export const MIN_FREE_BYTES = 1024 * 1024 * 1024

/** The pnpm version the CI lab job installs and the documentation names. */
export const PNPM_VERSION = '12.6.0'

/**
 * Locate a Playwright Chromium executable under one browser root.
 * @param browsersPath - Playwright browser root.
 * @param platform - process platform.
 * @returns the executable path, or undefined.
 */
export function findBrowserExecutable(browsersPath, platform = process.platform) {
  if (!existsSync(browsersPath)) return undefined
  const names = platform === 'win32'
    ? ['chrome-headless-shell.exe', 'chrome.exe']
    : ['chrome-headless-shell', 'chrome', 'headless_shell']
  const stack = [browsersPath]
  while (stack.length > 0) {
    const directory = stack.pop()
    let entries
    try {
      entries = readdirSync(directory, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        stack.push(path)
        continue
      }
      if (names.includes(entry.name)) return path
    }
  }
  return undefined
}

/**
 * Check that the running Node satisfies the repository baseline.
 * @returns one check.
 */
export function checkRuntime() {
  try {
    assertCurrentNode()
    return { name: 'runtime', status: 'ok', detail: `Node ${process.versions.node} satisfies engines.node` }
  } catch (error) {
    return { name: 'runtime', status: 'fail', detail: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Check that pnpm can install plugin dependencies.
 * @param env - environment used to resolve pnpm.
 * @returns one check.
 */
export function checkPnpm(env = process.env) {
  let result
  try {
    result = run('pnpm', ['--version'], { timeoutMs: 30_000, env })
  } catch (error) {
    return {
      name: 'pnpm',
      status: 'fail',
      detail: `pnpm is unavailable (${error instanceof Error ? error.message : String(error)}); run npm install --global pnpm@${PNPM_VERSION} and retry`,
    }
  }
  const version = result.stdout.trim()
  if (result.status !== 0) {
    return {
      name: 'pnpm',
      status: 'fail',
      detail: `pnpm --version exited ${result.status}: ${(result.stderr || result.stdout).trim().slice(0, 300)}; run npm install --global pnpm@${PNPM_VERSION} and retry`,
    }
  }
  if (version === '') {
    return {
      name: 'pnpm',
      status: 'fail',
      detail: `pnpm --version printed no version; run npm install --global pnpm@${PNPM_VERSION} and retry`,
    }
  }
  return { name: 'pnpm', status: 'ok', detail: `pnpm ${version}` }
}

/**
 * Check the DSH cache state.
 * @param version - expected DSH version.
 * @param base - cache root.
 * @returns one check.
 */
export function checkCache(version, base) {
  const entries = listCache(base).filter((entry) => entry.version === version && entry.ok)
  if (entries.length > 0) {
    return { name: 'dsh-cache', status: 'ok', detail: `${version} is cached (${entries[0].key})` }
  }
  return { name: 'dsh-cache', status: 'info', detail: `${version} is not cached; the run will install it` }
}

/**
 * Check the Playwright browser binary.
 * @param browsersPath - browser root.
 * @param platform - process platform.
 * @returns one check.
 */
export function checkBrowser(browsersPath, platform = process.platform) {
  const executable = findBrowserExecutable(browsersPath, platform)
  if (executable === undefined) {
    return {
      name: 'browser-binary',
      status: 'fail',
      detail: `no Playwright browser under ${browsersPath}; run PLAYWRIGHT_BROWSERS_PATH=${browsersPath} npx playwright install chromium`,
    }
  }
  return { name: 'browser-binary', status: 'ok', detail: executable }
}

/**
 * Check shared libraries for one browser binary.
 * @param executable - browser executable.
 * @param platform - process platform.
 * @returns one check.
 */
export function checkBrowserLibraries(executable, platform = process.platform) {
  if (platform !== 'linux') return { name: 'browser-libraries', status: 'info', detail: `skipped on ${platform}` }
  let result
  try {
    result = run('ldd', [executable], { timeoutMs: 30_000 })
  } catch (error) {
    return { name: 'browser-libraries', status: 'fail', detail: `ldd is unavailable: ${error instanceof Error ? error.message : String(error)}; install the browser dependencies` }
  }
  if (result.status !== 0) {
    return { name: 'browser-libraries', status: 'fail', detail: `ldd failed: ${(result.stderr || '').slice(0, 500)}` }
  }
  const missing = result.stdout.split('\n').filter((line) => line.includes('not found')).map((line) => line.trim())
  if (missing.length > 0) {
    return {
      name: 'browser-libraries',
      status: 'fail',
      detail: `${missing.join('; ')}; install the browser dependencies (playwright install-deps chromium or the CI image)`,
    }
  }
  return { name: 'browser-libraries', status: 'ok', detail: 'all shared libraries resolve' }
}

/**
 * Check for a CJK font.
 * @param env - environment used for fontconfig.
 * @param platform - process platform.
 * @returns one check.
 */
export function checkCjkFont(env = process.env, platform = process.platform) {
  if (platform !== 'linux') return { name: 'cjk-font', status: 'info', detail: `skipped on ${platform}` }
  let result
  try {
    result = run('fc-list', [':lang=zh'], { timeoutMs: 30_000, env })
  } catch (error) {
    return { name: 'cjk-font', status: 'fail', detail: `fc-list is unavailable (${error instanceof Error ? error.message : String(error)}); install fontconfig and a CJK font or set FONTCONFIG_FILE` }
  }
  if (result.status !== 0) {
    return { name: 'cjk-font', status: 'fail', detail: `fc-list :lang=zh failed; install a CJK font or set FONTCONFIG_FILE` }
  }
  if (result.stdout.trim() === '') {
    return { name: 'cjk-font', status: 'fail', detail: 'no CJK font found; install Noto Sans CJK or set FONTCONFIG_FILE' }
  }
  return { name: 'cjk-font', status: 'ok', detail: result.stdout.split('\n')[0] }
}

/**
 * Check free disk space.
 * @param path - path to measure.
 * @returns one check.
 */
export function checkDisk(path = LAB_ROOT) {
  if (!existsSync(path)) return { name: 'disk', status: 'ok', detail: `${path} does not exist yet` }
  try {
    const free = freeBytes(path)
    if (free === undefined) return { name: 'disk', status: 'info', detail: 'free space unknown' }
    if (free < MIN_FREE_BYTES) {
      return { name: 'disk', status: 'fail', detail: `${Math.round(free / 1024 / 1024)} MiB free under ${path}; need at least 1 GiB` }
    }
    return { name: 'disk', status: 'ok', detail: `${Math.round(free / 1024 / 1024)} MiB free` }
  } catch (error) {
    return { name: 'disk', status: 'fail', detail: error instanceof Error ? error.message : String(error) }
  }
}

function freeBytes(path) {
  try {
    const result = run('df', ['-Pk', path], { timeoutMs: 10_000 })
    if (result.status !== 0) return undefined
    const line = result.stdout.trim().split('\n').at(-1)
    const fields = line?.split(/\s+/) ?? []
    const available = Number(fields[3])
    return Number.isFinite(available) ? available * 1024 : undefined
  } catch {
    return undefined
  }
}

/**
 * Run every preflight check.
 * @param options - version, browsers path, cache base and dependency overrides.
 * @returns `{ ok, checks, version }`.
 */
export function runDoctor({
  root = ROOT,
  version = dshVersion(readPackage()),
  browsersPath,
  cacheBase,
  platform = process.platform,
  env = process.env,
  deps = {},
} = {}) {
  void root
  const resolvedBrowsers = browsersPath ?? env.PLAYWRIGHT_BROWSERS_PATH ?? BROWSERS_PATH
  const cache = deps.cache ?? ((v) => checkCache(v, cacheBase))
  const browser = deps.browser ?? ((p) => checkBrowser(p, platform))
  const browserCheck = browser(resolvedBrowsers)
  const libraries = browserCheck.status === 'ok'
    ? (deps.libraries ?? ((executable) => checkBrowserLibraries(executable, platform)))(browserCheck.detail)
    : { name: 'browser-libraries', status: 'info', detail: 'skipped: browser binary missing' }
  const fontConfig = env.FONTCONFIG_FILE ?? join(ROOT, '.cache', 'lab', 'fontconfig', 'fonts.conf')
  const fontEnv = existsSync(fontConfig) ? { ...env, FONTCONFIG_FILE: fontConfig } : env
  const checks = [
    deps.runtime ?? checkRuntime(),
    deps.pnpm === undefined ? checkPnpm(env) : deps.pnpm(),
    cache(version),
    browserCheck,
    libraries,
    deps.font === undefined ? checkCjkFont(fontEnv, platform) : deps.font(),
    deps.disk === undefined ? checkDisk(LAB_ROOT) : deps.disk(),
  ]
  return { ok: checks.every((check) => check.status !== 'fail'), checks, version }
}

/**
 * Render doctor checks for a terminal.
 * @param result - runDoctor result.
 * @returns lines.
 */
export function formatDoctor(result) {
  return [
    `DSH lab doctor (${result.version})`,
    ...result.checks.map((check) => `${check.status === 'ok' ? 'OK' : check.status === 'fail' ? 'FAIL' : 'INFO'} ${check.name}: ${check.detail}`),
    result.ok ? 'ready' : 'not ready',
  ]
}
