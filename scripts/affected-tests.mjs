#!/usr/bin/env node
/**
 * Select the test files a set of changed paths requires.
 *
 * The selector walks each `test/*.test.mjs` file's static relative imports,
 * through local test helpers, and stops at the plugin entry modules. Those
 * modules assemble the whole plugin, so expanding them would make every module
 * reach every test that imports the entry and the selection would be the full
 * suite again.
 *
 * A changed entry module, a path outside the source and test trees, or a path
 * with no importing test selects the full suite. The scoped run is feedback
 * during apply; the full instrumented run still decides completion.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { constants } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertCurrentNode } from './node-version.mjs'
import { finishRun, signalRunChild, spawnRunChild } from './run-signal.mjs'
import { beginRunTempDir, testEnvFor } from './test-env.mjs'
import { DEFAULT_CONCURRENCY } from './run-tests.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** The child a run is waiting on, so a signal can stop it before the root goes. */
let activeChild

/** The last runner a run started, kept after exit so a stop can reach its group. */
let lastChild

/** Entry modules that assemble the plugin; a change to one selects the full suite. */
const ENTRY_MODULES = new Set(['index.js', 'client.js', 'reviewer.js', 'lib/tools/index.js'])

/** Static relative import specifiers; dynamic imports and bare specifiers are ignored. */
const IMPORT_RE = /(?:from\s+|import\s+)['"](\.[^'"]+)['"]/g

/** Cache of per-test dependency closures keyed by root and test file. */
const CLOSURE_CACHE = new Map()

/** An error the CLI reports with a stable exit code. */
export class SelectorError extends Error {
  /**
   * @param message - what went wrong.
   * @param exitCode - process exit code.
   */
  constructor(message, exitCode = 2) {
    super(message)
    this.name = 'SelectorError'
    this.exitCode = exitCode
  }
}

/**
 * Normalize a repository-relative path.
 * @param path - raw path.
 * @returns the path without a leading `./` and with forward slashes.
 */
function normalize(path) {
  return path.replace(/^\.\//, '').replaceAll('\\', '/')
}

/**
 * List the repository's test files.
 * @param root - repository root.
 * @returns sorted repository-relative test paths.
 */
function listTestFiles(root) {
  return readdirSync(join(root, 'test'))
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => `test/${name}`)
}

/**
 * Resolve one relative import to a repository-relative file.
 * @param root - repository root.
 * @param fromFile - importing file, repository-relative.
 * @param spec - import specifier.
 * @returns the resolved path, or null when nothing matches.
 */
function resolveImport(root, fromFile, spec) {
  const candidate = resolve(dirname(resolve(root, fromFile)), spec)
  for (const path of [candidate, `${candidate}.js`, `${candidate}.mjs`, join(candidate, 'index.js')]) {
    if (existsSync(path) && statSync(path).isFile()) return normalize(relative(root, path))
  }
  return null
}

/**
 * Read a file's static relative imports.
 * @param root - repository root.
 * @param file - repository-relative file.
 * @returns resolved repository-relative import targets.
 */
function importsOf(root, file) {
  const text = readFileSync(join(root, file), 'utf8')
  const found = []
  for (const match of text.matchAll(IMPORT_RE)) {
    const target = resolveImport(root, file, match[1])
    if (target !== null && !target.startsWith('..')) found.push(target)
  }
  return found
}

/**
 * Compute a file's dependency closure, not expanding the entry modules.
 * @param root - repository root.
 * @param start - repository-relative file.
 * @returns repository-relative paths the file reaches.
 */
function closureOf(root, start) {
  const key = `${root}\u0000${start}`
  const cached = CLOSURE_CACHE.get(key)
  if (cached !== undefined) return cached
  const seen = new Set([start])
  const stack = [start]
  while (stack.length > 0) {
    const current = stack.pop()
    if (ENTRY_MODULES.has(current)) continue
    let deps = []
    try {
      deps = importsOf(root, current)
    } catch {
      continue
    }
    for (const dep of deps) {
      if (!seen.has(dep)) {
        seen.add(dep)
        stack.push(dep)
      }
    }
  }
  CLOSURE_CACHE.set(key, seen)
  return seen
}

/**
 * Select the test files that exercise the changed paths.
 *
 * @param options - root, changed paths and forced-full flag.
 * @returns sorted, de-duplicated test paths.
 */
export function selectAffectedTests({ root = ROOT, paths = [], all = false } = {}) {
  const tests = listTestFiles(root)
  if (all) return tests
  if (paths.length === 0) {
    throw new SelectorError('no changed path found; pass paths or --all')
  }
  const selected = new Set()
  for (const raw of paths) {
    const path = normalize(raw)
    if (path === '') continue
    if (ENTRY_MODULES.has(path)) return tests
    const absolute = join(root, path)
    const exists = existsSync(absolute)
    if (exists && statSync(absolute).isDirectory()) return tests
    if (exists && path.startsWith('test/') && path.endsWith('.test.mjs')) {
      selected.add(path)
      continue
    }
    if (!exists) return tests
    const hits = tests.filter((test) => closureOf(root, test).has(path))
    if (hits.length === 0) return tests
    for (const hit of hits) selected.add(hit)
  }
  if (selected.size === 0) return tests
  return [...selected].sort()
}

/**
 * Read the changed paths from the working tree.
 * @param gitStatus - optional `git status --porcelain` output provider, for tests.
 * @returns repository-relative paths, taking the destination of a rename.
 */
function readWorkingTreeChanges(gitStatus) {
  const output = gitStatus
    ? gitStatus()
    : execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
  const paths = []
  for (const line of output.split('\n')) {
    if (line.trim() === '') continue
    let entry = line.slice(3).trim()
    const arrow = entry.indexOf(' -> ')
    if (arrow !== -1) entry = entry.slice(arrow + 4)
    entry = entry.replace(/^"|"$/g, '')
    if (entry !== '') paths.push(entry)
  }
  if (paths.length === 0) {
    throw new SelectorError('no changed path found; pass paths or --all')
  }
  return paths
}

/**
 * Spawn the test runner and resolve with its outcome.
 *
 * @param command - executable.
 * @param args - arguments.
 * @param options - spawn options.
 * @returns a promise of the exit status or a spawn error.
 */
function spawnChild(command, args, options) {
  return new Promise((resolve) => {
    const child = spawnRunChild(command, args, options)
    activeChild = child
    lastChild = child
    child.once('error', (error) => {
      activeChild = undefined
      resolve({ error })
    })
    child.once('exit', (code, signal) => {
      activeChild = undefined
      resolve({ status: signal === null ? code : 128 + (constants.signals[signal] ?? 0) })
    })
  })
}

/**
 * Run the CLI.
 *
 * @param argv - arguments after the script name.
 * @param options - injectable runtime version, child-process spawner and working-tree listing, for tests.
 * @returns the process exit code.
 */
export async function main(argv, { version, spawn: spawner, gitStatus, tmpDir } = {}) {
  const flags = new Set()
  const paths = []
  for (const argument of argv) {
    if (argument === '--all' || argument === '--list' || argument === '--run') flags.add(argument.slice(2))
    else if (argument.startsWith('-')) throw new SelectorError(`unknown option: ${argument}`)
    else paths.push(argument)
  }

  assertCurrentNode({ version })

  const changed = flags.has('all') ? [] : paths.length > 0 ? paths : readWorkingTreeChanges(gitStatus)
  const files = selectAffectedTests({ root: ROOT, paths: changed, all: flags.has('all') })

  if (flags.has('list') || !flags.has('run')) {
    for (const file of files) console.log(file)
    return 0
  }

  const runner = spawner ?? spawnChild
  lastChild = undefined
  const ownsRoot = tmpDir === undefined
  const lifecycle = ownsRoot
    ? beginRunTempDir(process.env)
    : { env: { ...process.env, TMPDIR: tmpDir }, finish: () => {} }
  const env = testEnvFor(false, lifecycle.env)
  const finish = lifecycle.finish
  const handlers = []
  if (ownsRoot && spawner === undefined) {
    for (const [signal, number] of [['SIGINT', 2], ['SIGTERM', 15]]) {
      const handler = () => {
        const code = 128 + number
        const stop = async () => {
          try {
            await finishRun(lastChild, finish)
          } catch (error) {
            console.error(`affected tests: cannot stop the run group: ${error.message}`)
          }
          process.exit(code)
        }
        if (activeChild === undefined) {
          stop()
          return
        }
        activeChild.once('exit', () => {
          stop()
        })
        signalRunChild(activeChild, signal)
      }
      process.on(signal, handler)
      handlers.push([signal, handler])
    }
  }
  try {
    const result = await runner(process.execPath, ['--test', `--test-concurrency=${DEFAULT_CONCURRENCY}`, ...files], {
      cwd: ROOT,
      stdio: 'inherit',
      env,
    })
    if (result.error) throw result.error
    return result.status ?? 1
  } finally {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler)
    await finishRun(lastChild, finish)
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      console.error(`affected tests: ${error.message}`)
      process.exitCode = error.exitCode ?? 2
    })
}
