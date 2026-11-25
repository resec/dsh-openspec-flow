/**
 * The per-worktree toolchain record.
 *
 * The record names the Node, npm, pnpm and Chromium paths bootstrap resolved
 * for one worktree, the shared buckets that hold them, and the repository
 * inputs the record was written for. It is packaged with the plugin because
 * the apply workflow validates it from the installed tarball; the scripts
 * entrypoint re-exports it for bootstrap, the lab and the hook.
 *
 * Only Node built-ins are imported: the plugin runtime constraint applies here.
 *
 * @module dsh-openspec-flow/toolchain-record
 */

import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** The record schema this module writes and accepts. */
export const RECORD_SCHEMA = 1

/** The pnpm version this repository pins, aligned with the target DSH release. */
export const PNPM_VERSION = '11.28.5'

/** The record path relative to a worktree root. */
export const RECORD_RELATIVE = join('.cache', 'toolchain', 'manifest.json')

/** The repository files a record is bound to. */
export const INPUT_PATHS = [
  ['packageJson', 'package.json'],
  ['packageLock', 'package-lock.json'],
  ['coverageBaseline', 'coverage.baseline.json'],
  ['coverageConfig', 'coverage.config.json'],
]

/** A record or record-read failure with an actionable correction. */
export class RecordError extends Error {
  /**
   * @param message - what is wrong.
   * @param code - `invalid`, `stale` or `missing-path`.
   * @param correction - the command that repairs it.
   */
  constructor(message, code = 'invalid', correction = preparationCorrection()) {
    super(message)
    this.name = 'RecordError'
    this.code = code
    this.correction = correction
  }
}

/** The command that writes a current record in one worktree. */
export function preparationCorrection() {
  return 'run ./scripts/bootstrap.sh --deps-only in this worktree'
}

/**
 * The absolute record path for one worktree.
 * @param root - worktree root.
 * @returns the record path.
 */
export function recordPath(root) {
  return join(root, RECORD_RELATIVE)
}

/**
 * Hash one file's bytes.
 * @param path - absolute path.
 * @returns the lowercase hex digest.
 */
function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * Hash every input a record is bound to.
 * @param root - worktree root.
 * @returns the input hashes keyed as in `INPUT_PATHS`.
 * @throws {RecordError} when an input is missing.
 */
export function hashInputs(root) {
  const inputs = {}
  for (const [key, relative] of INPUT_PATHS) {
    const path = join(root, relative)
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new RecordError(`${relative} is missing from ${root}; run npm ci and prepare the worktree again`, 'invalid')
    }
    inputs[key] = hashFile(path)
  }
  return inputs
}

/**
 * Build a record for one worktree.
 *
 * The caller supplies the resolved tools; the inputs, schema, platform,
 * worktree and timestamp are written here so they cannot drift.
 * @param options - root, platform, requirements, node, npm, pnpm, chromium.
 * @returns the record object.
 */
export function buildRecord({
  root,
  platform = process.platform,
  requirements,
  node,
  npm,
  pnpm,
  chromium,
}) {
  return {
    schema: RECORD_SCHEMA,
    worktree: resolve(root),
    platform,
    generatedAt: new Date().toISOString(),
    requirements,
    inputs: hashInputs(root),
    node,
    npm,
    pnpm,
    chromium,
  }
}

/**
 * Write the record atomically.
 * @param root - worktree root.
 * @param record - the record object.
 * @returns the absolute record path.
 */
export function writeRecord(root, record) {
  const path = recordPath(root)
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`)
  renameSync(temporary, path)
  return path
}

/**
 * Read the raw record without classifying it.
 * @param root - worktree root.
 * @returns `{ state: 'absent' }`, `{ state: 'invalid', error }` or `{ state: 'record', record }`.
 */
function readRawRecord(root) {
  const path = recordPath(root)
  if (!existsSync(path)) return { state: 'absent' }
  try {
    const record = JSON.parse(readFileSync(path, 'utf8'))
    if (record === null || typeof record !== 'object' || Array.isArray(record)) {
      return { state: 'invalid', error: new RecordError(`the toolchain record at ${path} is not an object`) }
    }
    return { state: 'record', record }
  } catch (error) {
    return {
      state: 'invalid',
      error: new RecordError(`the toolchain record at ${path} cannot be read: ${error.message}`),
    }
  }
}

/**
 * Classify the current worktree's record.
 *
 * A record is current only when its schema, platform, worktree and pnpm
 * requirement match and every input hash still matches. A matching record is
 * returned; a missing one reports `absent` so a consumer can keep its `PATH`
 * behavior; a stale or unreadable one carries the correction.
 * @param root - worktree root.
 * @param options - platform and pnpm version overrides for tests.
 * @returns `{ state, record?, reasons?, correction? }`.
 */
export function readRecord(root, { platform = process.platform, pnpmVersion = PNPM_VERSION } = {}) {
  const raw = readRawRecord(root)
  if (raw.state === 'absent') return { state: 'absent' }
  if (raw.state === 'invalid') {
    return {
      state: 'invalid',
      reasons: [raw.error.message],
      correction: raw.error.correction,
      record: null,
    }
  }
  const { record } = raw
  const reasons = []
  if (record.schema !== RECORD_SCHEMA) reasons.push(`schema ${String(record.schema)} is not ${RECORD_SCHEMA}`)
  if (record.platform !== platform) reasons.push(`platform ${String(record.platform)} is not ${platform}`)
  if (typeof record.worktree !== 'string' || resolve(record.worktree) !== resolve(root)) {
    reasons.push(`the record names another worktree: ${String(record.worktree)}`)
  }
  if (record.requirements?.pnpm !== pnpmVersion) {
    reasons.push(`pnpm pin ${String(record.requirements?.pnpm)} is not ${pnpmVersion}`)
  }
  let inputs
  try {
    inputs = hashInputs(root)
  } catch (error) {
    reasons.push(error.message)
    inputs = undefined
  }
  if (inputs !== undefined) {
    for (const [key, relative] of INPUT_PATHS) {
      if (record.inputs?.[key] !== inputs[key]) reasons.push(`${relative} changed since the record was written`)
    }
  }
  if (reasons.length > 0) {
    return { state: 'stale', record, reasons, correction: preparationCorrection() }
  }
  return { state: 'current', record }
}

/**
 * Return the current record or throw the classified failure.
 * @param root - worktree root.
 * @param options - platform and pnpm version overrides for tests.
 * @returns the record.
 * @throws {RecordError} when the record is absent, stale or unreadable.
 */
export function requireRecord(root, options = {}) {
  const result = readRecord(root, options)
  if (result.state === 'current') return result.record
  if (result.state === 'absent') {
    throw new RecordError(`no toolchain record exists at ${recordPath(root)}`, 'invalid')
  }
  throw new RecordError(
    `the toolchain record at ${recordPath(root)} is ${result.state}: ${result.reasons.join('; ')}`,
    result.state === 'stale' ? 'stale' : 'invalid',
    result.correction,
  )
}

/**
 * List the recorded tool paths that no longer exist.
 * @param record - a record object.
 * @returns repository-visible labels for the missing paths.
 */
export function missingRecordPaths(record) {
  const candidates = [
    ['Node', record?.node?.path],
    ['npm', record?.npm?.path],
    ['pnpm entry', record?.pnpm?.js],
    ['pnpm bin directory', record?.pnpm?.binDir],
    ['Chromium directory', record?.chromium?.browsersPath],
  ]
  return candidates
    .filter(([, path]) => path !== undefined && path !== null)
    .filter(([, path]) => typeof path !== 'string' || path === '' || !existsSync(path))
    .map(([label, path]) => `${label} at ${String(path)}`)
}

/**
 * Realpath a path when it exists, else keep the resolved spelling.
 * @param path - path to normalize.
 * @returns the normalized path.
 */
export function realOrResolved(path) {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}
