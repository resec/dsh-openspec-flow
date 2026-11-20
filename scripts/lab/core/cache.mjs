/**
 * Independent DSH installations, cached by exact version and runtime shape.
 *
 * The cache is the only part of the lab that survives runs. A cache entry is
 * assembled in a temporary directory, verified, marked complete and renamed
 * into place under a directory lock.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DSH_CACHE, LOCKS, resolveNpmCache } from './paths.mjs'
import { run, sleep } from './process.mjs'

/** The DSH package installed from npm. */
export const DSH_PACKAGE = '@deepseek-ai/dsh'

/**
 * Resolve the exact DSH version a plugin wants.
 * @param packageJson - plugin package.json.
 * @returns the version without a leading `=`.
 */
export function dshVersion(packageJson) {
  const declared = packageJson?.engines?.dsh
  if (typeof declared !== 'string' || declared.trim() === '') {
    throw new Error('package.json does not declare engines.dsh')
  }
  return declared.trim().replace(/^=/, '')
}

/**
 * Build the cache key for one runtime shape.
 * @param options - version, Node version, platform and architecture.
 * @returns the key used under the DSH cache root.
 */
export function cacheKey({ version, nodeVersion = process.versions.node, platform = process.platform, arch = process.arch }) {
  const major = String(nodeVersion).replace(/^v/, '').split('.')[0]
  return `${version}/node${major}-${platform}-${arch}`
}

/**
 * The entry directory for one cache key.
 * @param key - cache key.
 * @param base - cache root.
 * @returns the absolute directory.
 */
export function cacheDirectory(key, base = DSH_CACHE) {
  return join(base, ...key.split('/'))
}

/**
 * The DSH CLI entry inside an install tree.
 * @param directory - install root.
 * @returns the bin path.
 */
export function binPath(directory) {
  return join(directory, 'node_modules', DSH_PACKAGE, 'lib', 'bin.js')
}

/**
 * Read one cache manifest.
 * @param directory - install root.
 * @returns the manifest, or undefined when absent or malformed.
 */
export function readManifest(directory) {
  try {
    const value = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'))
    return value !== null && typeof value === 'object' ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * Verify one install tree against its expected version.
 * @param directory - install root.
 * @param version - expected DSH version.
 * @returns `{ ok, reason }`.
 */
export function verifyInstall(directory, version) {
  const manifest = readManifest(directory)
  if (manifest === undefined) return { ok: false, reason: 'manifest.json is missing or malformed' }
  if (manifest.version !== version) return { ok: false, reason: `manifest names ${String(manifest.version)}, expected ${version}` }
  if (!existsSync(join(directory, '.complete'))) return { ok: false, reason: '.complete marker is missing' }
  if (!existsSync(binPath(directory))) return { ok: false, reason: 'DSH bin is missing' }
  try {
    const packageJson = JSON.parse(readFileSync(join(directory, 'node_modules', DSH_PACKAGE, 'package.json'), 'utf8'))
    if (packageJson.version !== version) return { ok: false, reason: `installed package is ${String(packageJson.version)}` }
  } catch {
    return { ok: false, reason: 'installed package.json is unreadable' }
  }
  return { ok: true, manifest }
}

/**
 * List cache entries for humans and `cache verify`.
 * @param base - cache root.
 * @returns `{ key, directory, version, ok, reason }` entries.
 */
export function listCache(base = DSH_CACHE) {
  const entries = []
  if (!existsSync(base)) return entries
  for (const version of readdirSync(base)) {
    const versionDirectory = join(base, version)
    if (!isDirectory(versionDirectory)) continue
    for (const shape of readdirSync(versionDirectory)) {
      const directory = join(versionDirectory, shape)
      if (!isDirectory(directory)) continue
      const state = verifyInstall(directory, version)
      entries.push({ key: `${version}/${shape}`, directory, version, ...state })
    }
  }
  return entries.sort((left, right) => left.key.localeCompare(right.key))
}

/**
 * Install one DSH version into a directory (no cache semantics).
 * @param options - version, directory, offline and environment.
 * @returns the install directory.
 */
export function installDsh({ version, directory, offline = false, env = process.env }) {
  if (offline) {
    throw new Error(`offline mode has no cached DSH ${version}; pre-install it or run without --offline`)
  }
  rmSync(directory, { recursive: true, force: true })
  mkdirSync(directory, { recursive: true })
  const result = run(
    process.env.NPM_BIN ?? 'npm',
    ['install', '--prefix', directory, '--no-audit', '--no-fund', `${DSH_PACKAGE}@${version}`],
    {
      timeoutMs: 20 * 60_000,
      env: { ...env, npm_config_cache: resolveNpmCache({ env }) },
    },
  )
  if (result.status !== 0) {
    throw new Error(`npm could not install DSH ${version}: ${(result.stderr || result.stdout).slice(-2_000)}`)
  }
  const check = verifyTree(directory, version)
  if (!check.ok) throw new Error(`the DSH install did not verify: ${check.reason}`)
  writeFileSync(
    join(directory, 'manifest.json'),
    `${JSON.stringify({ schemaVersion: 1, package: DSH_PACKAGE, version, node: process.versions.node, platform: process.platform, arch: process.arch, installedAt: new Date().toISOString(), bin: 'node_modules/@deepseek-ai/dsh/lib/bin.js' }, null, 2)}\n`,
  )
  writeFileSync(join(directory, '.complete'), `${version}\n`)
  const final = verifyInstall(directory, version)
  if (!final.ok) throw new Error(`the written DSH install did not verify: ${final.reason}`)
  const actual = installedVersion(directory)
  if (actual !== version) throw new Error(`the written DSH install reports ${actual}, expected ${version}`)
  return directory
}

function verifyTree(directory, version) {
  if (!existsSync(binPath(directory))) return { ok: false, reason: 'DSH bin is missing' }
  try {
    const packageJson = JSON.parse(readFileSync(join(directory, 'node_modules', DSH_PACKAGE, 'package.json'), 'utf8'))
    if (packageJson.version !== version) return { ok: false, reason: `installed package is ${String(packageJson.version)}` }
  } catch {
    return { ok: false, reason: 'installed package.json is unreadable' }
  }
  return { ok: true }
}

/**
 * Run the installed DSH CLI version.
 * @param directory - install root.
 * @param node - Node executable.
 * @returns the version string.
 */
export function installedVersion(directory, node = process.execPath) {
  const result = run(node, [binPath(directory), '--version'], { timeoutMs: 30_000 })
  if (result.status !== 0) throw new Error(`DSH --version failed: ${result.stderr.slice(-1_000)}`)
  return result.stdout.trim()
}

/**
 * Ensure a DSH install, from the cache or a fresh temporary tree.
 * @param options - version, offline, fresh, run directory and environment.
 * @returns `{ directory, bin, version, source, cacheKey, cacheHit }`.
 */
export async function ensureDsh({ version, offline = false, fresh = false, runDirectory, env = process.env, node = process.execPath }) {
  if (fresh && offline) throw new Error('--fresh-dsh and --offline cannot be combined')
  const key = cacheKey({ version, nodeVersion: process.versions.node })
  if (fresh) {
    const directory = join(runDirectory, 'dsh')
    installDsh({ version, directory, offline, env })
    return { directory, bin: binPath(directory), version, source: 'fresh', cacheKey: null, cacheHit: false }
  }
  const directory = cacheDirectory(key)
  let state = verifyInstall(directory, version)
  if (state.ok) {
    try {
      const actual = installedVersion(directory)
      if (actual !== version) state = { ok: false, reason: `installed CLI reports ${actual}` }
    } catch (error) {
      state = { ok: false, reason: `installed CLI cannot start: ${error instanceof Error ? error.message : String(error)}` }
    }
  }
  if (state.ok) {
    return { directory, bin: binPath(directory), version, source: 'cache', cacheKey: key, cacheHit: true }
  }
  if (offline) {
    throw new Error(`offline mode has no verified DSH cache entry for ${key}: ${state.reason}`)
  }
  await withLock(join(LOCKS, key.replaceAll('/', '_')), async () => {
    state = verifyInstall(directory, version)
    if (state.ok) return
    const staging = `${directory}.tmp-${process.pid}-${randomUUID()}`
    mkdirSync(staging, { recursive: true })
    try {
      installDsh({ version, directory: staging, env })
      mkdirSync(join(directory, '..'), { recursive: true })
      rmSync(directory, { recursive: true, force: true })
      renameSync(staging, directory)
    } catch (error) {
      rmSync(staging, { recursive: true, force: true })
      throw error
    }
  })
  const final = verifyInstall(directory, version)
  if (!final.ok) throw new Error(`the DSH cache entry did not verify: ${final.reason}`)
  const actual = installedVersion(directory)
  if (actual !== version) throw new Error(`the DSH cache entry reports ${actual}, expected ${version}`)
  return { directory, bin: binPath(directory), version, source: 'cache', cacheKey: key, cacheHit: false }
}

/**
 * Remove one cache key or the whole cache.
 * @param key - version or version/shape.
 * @param base - cache root.
 * @returns removed paths.
 */
export function removeCache(key, base = DSH_CACHE) {
  const target = join(base, ...key.split('/'))
  if (!existsSync(target)) throw new Error(`no cache entry ${key}`)
  rmSync(target, { recursive: true, force: true })
  return [target]
}

/**
 * Remove entries not used since the given time.
 * @param options - base, keep keys and current time.
 * @returns removed paths.
 */
export function pruneCache({ base = DSH_CACHE, keep = [], now = Date.now() } = {}) {
  const removed = []
  for (const entry of listCache(base)) {
    if (keep.includes(entry.key)) continue
    const age = now - statSync(entry.directory).mtimeMs
    if (age > 30 * 24 * 60 * 60 * 1000) {
      rmSync(entry.directory, { recursive: true, force: true })
      removed.push(entry.directory)
    }
  }
  return removed
}

/**
 * Serialize work under one directory lock.
 * @param lockPath - lock directory.
 * @param work - async work.
 * @param timeoutMs - maximum wait for the lock.
 * @returns the work result.
 */
export async function withLock(lockPath, work, timeoutMs = 15 * 60_000) {
  const deadline = Date.now() + timeoutMs
  mkdirSync(join(lockPath, '..'), { recursive: true })
  for (;;) {
    try {
      mkdirSync(lockPath)
      break
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      const stale = isStaleLock(lockPath)
      if (stale) {
        rmSync(lockPath, { recursive: true, force: true })
        continue
      }
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${lockPath}`)
      await sleep(50)
    }
  }
  writeFileSync(join(lockPath, 'pid'), `${process.pid}\n`)
  try {
    return await work()
  } finally {
    rmSync(lockPath, { recursive: true, force: true })
  }
}

function isStaleLock(lockPath) {
  try {
    const pid = Number(readFileSync(join(lockPath, 'pid'), 'utf8').trim())
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0)
        return false
      } catch (error) {
        if (error.code === 'ESRCH') return true
      }
    }
    return Date.now() - statSync(lockPath).mtimeMs > 30 * 60_000
  } catch {
    return false
  }
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
