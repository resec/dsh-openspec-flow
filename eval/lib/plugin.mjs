/**
 * Resolve, validate and describe the plugin under evaluation.
 *
 * This module is the only place that knows how the harness finds the tested
 * plugin. Consumers receive a resolved root or descriptor; they never derive
 * it from their own location.
 *
 * @module eval/lib/plugin
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Package name a valid plugin root must declare. */
export const PLUGIN_PACKAGE = 'dsh-openspec-flow'

/** Absolute `eval/` directory. */
export const EVAL_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Default clone URL for the explicit fallback. */
export const DEFAULT_PLUGIN_URL = 'git@github.com:resec/dsh-openspec-flow.git'

/** Default ref checked out by the clone fallback. */
export const DEFAULT_PLUGIN_REF = 'main'

/**
 * Sibling locations tried before the current repository root. Two depths are
 * covered so both a repository-root harness and an `eval/` subdirectory
 * harness find the plugin beside them.
 */
export const DEFAULT_SIBLING_ROOTS = Object.freeze([
  resolve(EVAL_ROOT, '..', PLUGIN_PACKAGE),
  resolve(EVAL_ROOT, '..', '..', PLUGIN_PACKAGE),
])

/** Current repository root; the pre-split single-repository default. */
export const DEFAULT_CURRENT_ROOT = resolve(EVAL_ROOT, '..')

function git(root, args, { run }) {
  const result = run('git', ['-C', root, ...args], { encoding: 'utf8' })
  if (result.error) throw result.error
  return result
}

/**
 * Read a root's package metadata.
 * @param root - candidate directory.
 * @returns `{ name, version }`, or null when unreadable.
 */
export function readPackage(root) {
  const path = join(root, 'package.json')
  if (!existsSync(path)) return null
  try {
    const manifest = JSON.parse(readFileSync(path, 'utf8'))
    return { name: manifest.name ?? null, version: manifest.version ?? null }
  } catch {
    return null
  }
}

/**
 * Report whether a directory declares the plugin package.
 * @param root - candidate directory.
 * @returns true for a valid plugin root.
 */
export function isPluginRoot(root) {
  return readPackage(root)?.name === PLUGIN_PACKAGE
}

function invalidRoot(source, path) {
  return new Error(
    `${source} plugin root is not ${PLUGIN_PACKAGE}: ${path} (expected a package.json with that name)`,
  )
}

/**
 * Resolve the tested plugin root.
 *
 * Explicit sources (`--plugin-root`, `EVAL_PLUGIN_ROOT`) are authoritative and
 * fail loudly when invalid. Automatic candidates are tried in order and
 * skipped when absent or invalid.
 *
 * @param options - explicit path, environment value, sibling and fallback roots.
 * @returns `{ root, source }`.
 */
export function resolvePluginRoot({
  explicit = null,
  env = process.env.EVAL_PLUGIN_ROOT,
  siblingRoots = DEFAULT_SIBLING_ROOTS,
  currentRoot = DEFAULT_CURRENT_ROOT,
} = {}) {
  if (explicit !== null && explicit !== undefined && String(explicit).trim() !== '') {
    const root = resolve(String(explicit))
    if (!existsSync(root)) throw new Error(`plugin root not found: ${root}`)
    if (!isPluginRoot(root)) throw invalidRoot('--plugin-root', root)
    return { root, source: 'flag' }
  }

  const environment = typeof env === 'string' ? env.trim() : ''
  if (environment !== '') {
    const root = resolve(environment)
    if (!existsSync(root)) throw new Error(`plugin root not found: ${root}`)
    if (!isPluginRoot(root)) throw invalidRoot('EVAL_PLUGIN_ROOT', root)
    return { root, source: 'environment' }
  }

  const attempted = []
  for (const candidate of siblingRoots) {
    const root = resolve(candidate)
    attempted.push(root)
    if (!existsSync(root) || !isPluginRoot(root)) continue
    return { root, source: 'sibling' }
  }

  const repository = resolve(currentRoot)
  attempted.push(repository)
  if (existsSync(repository) && isPluginRoot(repository)) {
    return { root: repository, source: 'repository' }
  }

  throw new Error(
    `cannot resolve the ${PLUGIN_PACKAGE} root; tried ${attempted.join(', ')}. ` +
      'Pass --plugin-root <dir> or set EVAL_PLUGIN_ROOT.',
  )
}

/**
 * Describe the tested plugin for a run record.
 *
 * A non-git root still reports its package version; commit and dirty are null.
 *
 * @param root - resolved plugin root.
 * @param options - injectable command runner.
 * @returns `{ root, name, version, commit, dirty }`.
 */
export function describePlugin(root, { run = spawnSync } = {}) {
  const resolved = resolve(root)
  const manifest = readPackage(resolved)
  if (manifest === null || manifest.name !== PLUGIN_PACKAGE) {
    throw invalidRoot('plugin', resolved)
  }
  const head = git(resolved, ['rev-parse', '--short', 'HEAD'], { run })
  const status = git(resolved, ['status', '--porcelain'], { run })
  return {
    root: resolved,
    name: manifest.name,
    version: manifest.version,
    commit: head.status === 0 ? head.stdout.trim() || null : null,
    dirty: status.status === 0 ? status.stdout.trim() !== '' : null,
  }
}

/**
 * Fail when a fixture base commit is not reachable from the plugin checkout.
 * @param root - plugin root.
 * @param commit - full commit hash from a fixture manifest.
 * @param options - injectable command runner.
 */
export function assertCommitReachable(root, commit, { run = spawnSync } = {}) {
  const result = git(root, ['cat-file', '-e', `${commit}^{commit}`], { run })
  if (result.status !== 0) {
    throw new Error(`fixture base commit ${commit} is not reachable from ${root}`)
  }
}

function execute(run, command, args, label) {
  const result = run(command, args, { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${(result.stderr ?? '').trim()}`)
  }
  return result
}

/**
 * Clone or refresh the plugin checkout used when no local root resolves.
 *
 * The clone is full, never shallow, because real fixtures archive historical
 * commits. An existing checkout is fetched and checked out instead of cloned
 * again. Every command goes through the injected runner so tests stay offline.
 *
 * @param options - repository URL, ref, destination and command runner.
 * @returns `{ root, cloned, ref }`.
 */
export function clonePlugin({
  url = DEFAULT_PLUGIN_URL,
  ref = DEFAULT_PLUGIN_REF,
  destination = join(EVAL_ROOT, '.plugin'),
  run = spawnSync,
} = {}) {
  const root = resolve(destination)
  const checkout = existsSync(join(root, '.git'))
  if (!checkout && existsSync(root)) {
    throw new Error(`refusing to clone into a non-git directory: ${root}`)
  }

  if (!checkout) {
    execute(run, 'git', ['clone', url, root], `git clone ${url}`)
  }
  execute(run, 'git', ['-C', root, 'fetch', '--all', '--tags'], 'git fetch')
  const result = run('git', ['-C', root, 'checkout', ref], { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    execute(run, 'git', ['-C', root, 'checkout', '-B', ref, `origin/${ref}`], `git checkout ${ref}`)
  }
  if (!isPluginRoot(root)) throw invalidRoot('cloned', root)
  return { root, cloned: !checkout, ref }
}

