#!/usr/bin/env node
/**
 * Record and verify the coverage stamp the pre-push hook reuses.
 *
 * The stamp is a local hint. It proves that an enforce-mode verification run
 * passed for the committed inputs it fingerprints, so the hook may skip the
 * instrumented rerun. Every failure path refuses the stamp and the hook then
 * runs the gate, so an unusable stamp can only cost time, never lower the gate.
 */

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolveBase } from './coverage-gate.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const STAMP_FILE = join('.cache', 'coverage-stamp.json')
const RECORD_VERSION = 1
const BASE_REF = 'origin/main'

/**
 * Every committed input whose change can alter a coverage verdict.
 *
 * `skills/`, `README.md` and `docs/review.md` are deliberately absent: the
 * suite asserts their content, but editing them cannot move a coverage number.
 */
export const STAMP_INPUTS = [
  'lib',
  'index.js',
  'test',
  'package.json',
  'package-lock.json',
  'coverage.config.json',
  'coverage.baseline.json',
  'scripts/coverage.mjs',
  'scripts/coverage-gate.mjs',
  'scripts/coverage-stamp.mjs',
  'scripts/run-tests.mjs',
  'scripts/test-env.mjs',
  'scripts/node-version.mjs',
]

export class StampError extends Error {
  /**
   * @param message - what failed.
   * @param exitCode - process exit code for the CLI.
   */
  constructor(message, exitCode = 2) {
    super(message)
    this.name = 'StampError'
    this.exitCode = exitCode
  }
}

/**
 * @param root - repository root.
 * @param args - git arguments.
 * @param options - `allowFailure` returns the result instead of throwing.
 * @returns the spawn result.
 */
function runGit(root, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.error) throw new StampError(`git ${args.join(' ')} failed: ${result.error.message}`)
  if (result.status !== 0 && !allowFailure) {
    throw new StampError(`git ${args.join(' ')} failed: ${(result.stderr ?? '').trim()}`)
  }
  return result
}

/**
 * @param root - repository root.
 * @returns the absolute path of the stamp file.
 */
export function stampPath(root = ROOT) {
  return join(root, STAMP_FILE)
}

/**
 * A clean tree is required because the fingerprint names a commit: the run
 * that minted the stamp measured the working tree, so the two must coincide.
 *
 * @param root - repository root.
 * @returns true when the tree is dirty or cannot be inspected.
 */
export function isDirty(root = ROOT) {
  const result = runGit(root, ['status', '--porcelain', '--untracked-files=all'], { allowFailure: true })
  if (result.status !== 0) return true
  return (result.stdout ?? '')
    .split('\n')
    .filter((line) => line !== '')
    .some((line) => {
      const path = line.slice(3)
      const target = path.includes(' -> ') ? path.split(' -> ')[1] : path
      // A parallel change's planning directory cannot move a coverage verdict,
      // and the repository's seal rules already ignore it.
      return !target.startsWith('openspec/changes/')
    })
}

/**
 * @param root - repository root.
 * @returns the checked commit.
 */
export function headCommit(root = ROOT) {
  const result = runGit(root, ['rev-parse', '--verify', 'HEAD'], { allowFailure: true })
  if (result.status !== 0) throw new StampError('cannot read HEAD; a stamp needs a commit')
  return (result.stdout ?? '').trim()
}

/**
 * Hash the committed identity of every input.
 *
 * @param root - repository root.
 * @returns the fingerprint hex digest.
 */
export function fingerprint(root = ROOT) {
  const digest = createHash('sha256')
  for (const path of STAMP_INPUTS) {
    const result = runGit(root, ['rev-parse', '--verify', `HEAD:${path}`], { allowFailure: true })
    if (result.status !== 0) {
      throw new StampError(`cannot read ${path} from HEAD; a stamp needs every input`)
    }
    digest.update(`${path}\n${(result.stdout ?? '').trim()}\n`)
  }
  return digest.digest('hex')
}

/**
 * @param root - repository root.
 * @returns the stamp record, or null when none is recorded.
 * @throws StampError when the file exists but cannot be used.
 */
export function readStamp(root = ROOT) {
  const path = stampPath(root)
  if (!existsSync(path)) return null
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    throw new StampError(`cannot read ${STAMP_FILE}: ${error.message}`)
  }
  let record
  try {
    record = JSON.parse(raw)
  } catch {
    throw new StampError(`${STAMP_FILE} is not valid JSON`)
  }
  if (record === null || typeof record !== 'object' || record.version !== RECORD_VERSION) {
    throw new StampError(`${STAMP_FILE} has an unsupported version`)
  }
  for (const field of ['node', 'head', 'base', 'fingerprint', 'checkedAt']) {
    if (typeof record[field] !== 'string' || record[field] === '') {
      throw new StampError(`${STAMP_FILE} is missing ${field}`)
    }
  }
  return {
    version: record.version,
    node: record.node,
    head: record.head,
    base: record.base,
    fingerprint: record.fingerprint,
    checkedAt: record.checkedAt,
  }
}

/**
 * Record a passing enforce run.
 *
 * A dirty tree is refused as a non-throwing no-op: this runs inside the gate's
 * pass callback, so throwing would turn a passing verification into a failure.
 *
 * @param options - root, the merge base the gate resolved, and the Node version.
 * @returns `{ written, reason, record }`.
 */
export function writeStamp({ root = ROOT, base, node = process.version } = {}) {
  if (typeof base !== 'string' || base === '') {
    return { written: false, reason: 'the gate did not resolve a merge base', record: null }
  }
  if (isDirty(root)) {
    return { written: false, reason: 'the working tree is dirty, so the commit was not measured', record: null }
  }
  const record = {
    version: RECORD_VERSION,
    node,
    head: headCommit(root),
    base,
    fingerprint: fingerprint(root),
    checkedAt: new Date().toISOString(),
  }
  const path = stampPath(root)
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`)
  renameSync(temporary, path)
  return { written: true, reason: `recorded the pass at ${record.head}`, record }
}

/**
 * Remove a recorded stamp.
 *
 * @param options - repository root.
 * @returns `{ cleared, reason }`.
 */
export function clearStamp({ root = ROOT } = {}) {
  if (isDirty(root)) {
    return { cleared: false, reason: 'the working tree is dirty, so the record was left untouched' }
  }
  const path = stampPath(root)
  if (!existsSync(path)) return { cleared: false, reason: 'no stamp is recorded' }
  rmSync(path, { force: true })
  return { cleared: true, reason: 'removed the stamp' }
}

/**
 * Clear on an evaluation failure only.
 *
 * @param options - root, the effective mode, and whether the run updates the baseline.
 * @returns `{ cleared, reason }`.
 */
export function clearStampOnFailure({ root = ROOT, mode, updateBaseline = false } = {}) {
  if (mode !== 'enforce') return { cleared: false, reason: 'only an enforce run clears the stamp' }
  if (updateBaseline) return { cleared: false, reason: 'a baseline update has no verdict to clear' }
  return clearStamp({ root })
}

/**
 * Decide whether the hook may skip the gate.
 *
 * @param options - repository root and the running Node version.
 * @returns `{ ok, reason, record }`.
 */
export function checkStamp({ root = ROOT, node = process.version } = {}) {
  let record
  try {
    record = readStamp(root)
  } catch (error) {
    return { ok: false, reason: error.message, record: null }
  }
  if (record === null) return { ok: false, reason: `no stamp is recorded at ${STAMP_FILE}`, record: null }
  if (isDirty(root)) return { ok: false, reason: 'the working tree is dirty', record }
  if (record.node !== node) {
    return { ok: false, reason: `the stamp was written on ${record.node}, not ${node}`, record }
  }
  let head
  let base
  let current
  try {
    head = headCommit(root)
    base = resolveBase(root, BASE_REF)
    current = fingerprint(root)
  } catch (error) {
    return { ok: false, reason: error.message, record }
  }
  if (current !== record.fingerprint) {
    return { ok: false, reason: 'the coverage inputs changed since the stamp was written', record }
  }
  if (base !== record.base) {
    return { ok: false, reason: `the merge base moved from ${record.base} to ${base}`, record }
  }
  return { ok: true, reason: `reused the pass recorded at ${record.head}`, record, head }
}

function parseArgs(argv) {
  const options = { command: undefined, root: ROOT }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') {
      options.root = argv[++index]
      if (!options.root) throw new StampError('--root needs a path')
    } else if (arg.startsWith('-')) {
      throw new StampError(`unknown argument: ${arg}`)
    } else if (options.command === undefined) {
      options.command = arg
    } else {
      throw new StampError(`unknown argument: ${arg}`)
    }
  }
  return options
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.command !== 'check') {
      throw new StampError(`unknown command: ${options.command ?? '(none)'}; use check`)
    }
    const result = checkStamp({ root: options.root })
    if (!result.ok) {
      process.stderr.write(`coverage stamp: ${result.reason}\n`)
      process.exitCode = 1
      return
    }
    process.stdout.write(`coverage stamp: ${result.reason}\n`)
    process.exitCode = 0
  } catch (error) {
    process.stderr.write(`coverage stamp: ${error.message}\n`)
    process.exitCode = error.exitCode ?? 2
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main()
}
