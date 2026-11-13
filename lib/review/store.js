/**
 * Review record storage and serialization.
 *
 * Review records live under `<projectRoot>/openspec/.review/` so they stay
 * outside the change directory and survive archiving. The record root is
 * ignored through `openspec/.gitignore`; a git project verifies the record
 * path with `git check-ignore` before writing. A project without git keeps the
 * same layout.
 *
 * @module dsh-openspec-flow/review/store
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'

/** Review directory name under the OpenSpec root. */
export const REVIEW_DIRECTORY = '.review'

/** Ignore line added to `openspec/.gitignore`. */
export const REVIEW_IGNORE_LINE = '.review/'

let atomicCounter = 0

/**
 * Lowercase SHA-256 of a UTF-8 string.
 * @param text - content.
 * @returns hex digest.
 */
export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * Refuse a value that would escape the review root or change its key.
 * @param value - change name or store id.
 * @param label - field name for the diagnostic.
 * @returns the trimmed value.
 * @throws when the value is empty or contains a path separator or `..`.
 */
export function assertSafeSegment(value, label) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text === '' || text === '.' || text === '..'
    || text.includes('/') || text.includes('\\') || text.includes('\0')) {
    throw new Error(`${label} must be one non-empty path segment`)
  }
  return text
}

/**
 * The review key: `<store>#<change>` or `local#<change>`.
 * @param store - optional store id.
 * @param change - change name.
 * @returns the key.
 */
export function reviewKey(store, change) {
  const name = assertSafeSegment(change, 'change')
  const storeText = typeof store === 'string' ? store.trim() : ''
  if (storeText === '') return `local#${name}`
  return `${assertSafeSegment(storeText, 'store')}#${name}`
}

/**
 * The review root for a project.
 * @param projectRoot - absolute project root.
 * @returns absolute review root.
 */
export function reviewRoot(projectRoot) {
  return join(projectRoot, 'openspec', REVIEW_DIRECTORY)
}

/**
 * The review directory for one change.
 * @param projectRoot - absolute project root.
 * @param store - optional store id.
 * @param change - change name.
 * @returns absolute review directory.
 */
export function reviewDirectory(projectRoot, store, change) {
  return join(reviewRoot(projectRoot), reviewKey(store, change))
}

/**
 * Resolve the tree of a revision.
 * @param root - project root.
 * @param rev - revision, default HEAD.
 * @returns the tree SHA, or undefined.
 */
export function gitTree(root, rev = 'HEAD') {
  const result = spawnSync('git', ['-C', root, 'rev-parse', `${rev}^{tree}`], { encoding: 'utf8' })
  if (result.status !== 0) return undefined
  const value = result.stdout.trim()
  return value === '' ? undefined : value
}

/**
 * Resolve the merge base of two revisions.
 * @param root - project root.
 * @param left - first revision.
 * @param right - second revision.
 * @returns the merge-base SHA, or undefined.
 */
export function gitMergeBase(root, left, right) {
  const result = spawnSync('git', ['-C', root, 'merge-base', left, right], { encoding: 'utf8' })
  if (result.status !== 0) return undefined
  const value = result.stdout.trim()
  return value === '' ? undefined : value
}

/**
 * Read a diff between two trees or commits.
 * @param root - project root.
 * @param base - base tree.
 * @param target - target tree.
 * @returns the diff text, or undefined when git fails.
 */
export function gitDiff(root, base, target) {
  const result = spawnSync('git', ['-C', root, 'diff', base, target], { encoding: 'utf8' })
  if (result.status !== 0) return undefined
  return result.stdout
}

/**
 * Read the working tree status. An ignored review directory does not appear.
 * @param root - project root.
 * @returns porcelain output, or undefined when the status could not be read.
 */
export function gitStatus(root) {
  const result = spawnSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })
  if (result.status !== 0) return undefined
  return result.stdout
}

/**
 * Whether a directory is a git work tree.
 * @param root - project root.
 * @returns true when git reports a work tree.
 */
export function isGitRepository(root) {
  const result = spawnSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], {
    encoding: 'utf8',
  })
  return result.status === 0 && result.stdout.trim() === 'true'
}

/**
 * Resolve a git commit.
 * @param root - project root.
 * @param rev - revision, default HEAD.
 * @returns the commit SHA, or undefined.
 */
export function gitCommit(root, rev = 'HEAD') {
  const result = spawnSync('git', ['-C', root, 'rev-parse', rev], { encoding: 'utf8' })
  if (result.status !== 0) return undefined
  const value = result.stdout.trim()
  return value === '' ? undefined : value
}

/**
 * Ensure `openspec/.gitignore` contains `.review/`.
 *
 * The line is appended when missing. Existing unrelated lines are preserved;
 * the plugin owns only its own entry.
 * @param projectRoot - absolute project root.
 * @returns nothing.
 * @throws when the ignore file cannot be written.
 */
export function ensureReviewIgnored(projectRoot) {
  const directory = join(projectRoot, 'openspec')
  mkdirSync(directory, { recursive: true })
  const file = join(directory, '.gitignore')
  let text = ''
  if (existsSync(file)) text = readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/u)
  if (lines.some((line) => line.trim() === REVIEW_IGNORE_LINE)) return
  const prefix = text === '' || text.endsWith('\n') ? text : `${text}\n`
  writeTextAtomic(file, `${prefix}${REVIEW_IGNORE_LINE}\n`)
}

/**
 * Refuse a record path that git tracks.
 *
 * A project without git is accepted: the record still uses the same path, and
 * there is no index to pollute.
 * @param projectRoot - absolute project root.
 * @param directory - absolute review directory.
 * @returns nothing.
 * @throws when git does not ignore the record directory.
 */
export function assertReviewIgnored(projectRoot, directory) {
  if (!isGitRepository(projectRoot)) return
  ensureReviewIgnored(projectRoot)
  const target = relative(projectRoot, directory)
  const result = spawnSync('git', ['-C', projectRoot, 'check-ignore', '-q', target], {
    encoding: 'utf8',
  })
  if (result.status === 0) return
  if (result.status === 1) {
    throw new Error(
      `review record path '${target}' is not ignored by git; add '${REVIEW_IGNORE_LINE}' to openspec/.gitignore`,
    )
  }
  throw new Error(
    `review record path '${target}' could not be checked against git: ${result.stderr.trim() || 'git check-ignore failed'}`,
  )
}

/**
 * Read a UTF-8 file, returning undefined when absent.
 * @param file - absolute path.
 * @returns text, or undefined.
 */
export function readText(file) {
  if (!existsSync(file)) return undefined
  return readFileSync(file, 'utf8')
}

/**
 * Read a JSON file, returning undefined when absent.
 * @param file - absolute path.
 * @returns parsed value, or undefined.
 * @throws when the file exists but is not valid JSON.
 */
export function readJson(file) {
  const text = readText(file)
  if (text === undefined) return undefined
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`cannot parse ${file}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Write one text file atomically: temporary file, then rename.
 * @param file - destination.
 * @param text - content.
 * @returns nothing.
 */
export function writeTextAtomic(file, text) {
  const temporary = `${file}.tmp-${String(process.pid)}-${String(++atomicCounter)}`
  try {
    writeFileSync(temporary, text)
    renameSync(temporary, file)
  } catch (error) {
    try {
      rmSync(temporary, { force: true })
    } catch {
      // The temporary file is already gone; the original failure matters.
    }
    throw error
  }
}

/**
 * Write one JSON file with two-space indentation atomically.
 * @param file - destination.
 * @param value - JSON value.
 * @returns nothing.
 */
export function writeJsonAtomic(file, value) {
  writeTextAtomic(file, `${JSON.stringify(value, null, 2)}\n`)
}

/**
 * Ensure a directory exists.
 * @param directory - absolute path.
 * @returns nothing.
 */
export function ensureDirectory(directory) {
  mkdirSync(directory, { recursive: true })
}

/**
 * Run a mutation under a per-review-directory lock.
 *
 * The lock is a directory so `mkdir` is atomic on every supported filesystem.
 * A holder is reported instead of waiting; a stale lock is removed by hand.
 * @param directory - review directory.
 * @param action - label used in diagnostics.
 * @param work - mutation.
 * @returns the mutation's result.
 */
export function withReviewLock(directory, action, work) {
  ensureDirectory(directory)
  const lock = join(directory, '.lock')
  try {
    mkdirSync(lock)
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EEXIST') {
      throw new Error(`review ${action}: another write holds ${lock}; retry after it finishes`)
    }
    throw error
  }
  try {
    return work()
  } finally {
    try {
      rmSync(lock, { recursive: true, force: true })
    } catch {
      // A failed unlock must not hide the mutation result.
    }
  }
}

/**
 * Run an async mutation under the same review-directory lock.
 * @param directory - review directory.
 * @param action - label used in diagnostics.
 * @param work - async mutation.
 * @returns the mutation's result.
 */
export async function withReviewLockAsync(directory, action, work) {
  ensureDirectory(directory)
  const lock = join(directory, '.lock')
  try {
    mkdirSync(lock)
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EEXIST') {
      throw new Error(`review ${action}: another write holds ${lock}; retry after it finishes`)
    }
    throw error
  }
  try {
    return await work()
  } finally {
    try {
      rmSync(lock, { recursive: true, force: true })
    } catch {
      // A failed unlock must not hide the mutation result.
    }
  }
}

/**
 * Whether a path is a regular file.
 * @param file - candidate.
 * @returns true when it exists and is a file.
 */
export function isFile(file) {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
}
