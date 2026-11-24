/**
 * Review record storage and serialization.
 *
 * Git projects keep review records under the git common directory so the main
 * worktree, apply worktrees and PR worktrees share one store. A project without
 * git keeps the legacy `<projectRoot>/openspec/.review/` root. A legacy record is
 * copied once to the shared root and never deleted; the shared root lives
 * outside the worktree and needs no ignore rule.
 *
 * @module dsh-openspec-flow/review/store
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { statusLinePath } from '../status-paths.js'

export { statusLinePath }

/** Review directory name under the OpenSpec root. */
export const REVIEW_DIRECTORY = '.review'

/** Ignore line added to `openspec/.gitignore`. */
export const REVIEW_IGNORE_LINE = '.review/'

/** The separator between the store id and the change name in a review key. */
const KEY_SEPARATOR = '#'

let atomicCounter = 0

/** Cached git root resolutions, keyed by project root. */
const gitCommonDirCache = new Map()
const gitTopLevelCache = new Map()

/**
 * Forget every cached git root resolution.
 *
 * Tests call it between fixtures; a caller that moves a project root to a new
 * git common directory can call it after the move.
 * @returns nothing.
 */
export function clearGitRootCache() {
  gitCommonDirCache.clear()
  gitTopLevelCache.clear()
}

/**
 * Lowercase SHA-256 of a UTF-8 string.
 * @param text - content.
 * @returns hex digest.
 */
export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * Refuse a value that would escape the review root.
 * @param value - one name, or a review key that may carry the separator.
 * @param label - field name for the diagnostic.
 * @returns the trimmed value.
 * @throws when the value is empty or contains a path separator or `..`.
 */
function assertPathSegment(value, label) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text === '' || text === '.' || text === '..'
    || text.includes('/') || text.includes('\\') || text.includes('\0')) {
    throw new Error(`${label} must be one non-empty path segment`)
  }
  return text
}

/**
 * Refuse a value that would escape the review root or change its key.
 *
 * `reviewKey` joins `<store>#<change>` and the apply state path appends
 * `.json` to that key, so a separator inside one half lets two different
 * names build one key. A control character would make the name unreadable in
 * a diagnostic. NUL is refused as a path escape, before this check.
 * @param value - change name or store id.
 * @param label - field name for the diagnostic.
 * @returns the trimmed value.
 * @throws when the value is empty or contains a path separator, `..`, the key separator or a control character.
 */
export function assertSafeSegment(value, label) {
  const text = assertPathSegment(value, label)
  if (text.includes(KEY_SEPARATOR) || /[\u0000-\u001f\u007f]/u.test(text)) {
    throw new Error(`${label} must not contain '${KEY_SEPARATOR}' or a control character`)
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
  if (storeText === '') return `local${KEY_SEPARATOR}${name}`
  return `${assertSafeSegment(storeText, 'store')}${KEY_SEPARATOR}${name}`
}

/**
 * Resolve the git common directory for a project.
 * @param projectRoot - absolute project root.
 * @param run - git runner, injectable for tests.
 * @returns the absolute common directory, or undefined outside git.
 */
export function gitCommonDir(projectRoot, run = spawnSync) {
  if (gitCommonDirCache.has(projectRoot)) return gitCommonDirCache.get(projectRoot)
  const result = run('git', ['-C', projectRoot, 'rev-parse', '--path-format=absolute', '--git-common-dir'], {
    encoding: 'utf8',
  })
  if (result.status !== 0) return undefined
  const value = result.stdout.trim()
  if (value === '') return undefined
  const resolved = isAbsolute(value) ? value : resolve(projectRoot, value)
  gitCommonDirCache.set(projectRoot, resolved)
  return resolved
}

/**
 * Resolve the worktree top level for a project.
 * @param projectRoot - absolute project root.
 * @param run - git runner, injectable for tests.
 * @returns the absolute top level, or undefined outside git.
 */
export function gitTopLevel(projectRoot, run = spawnSync) {
  if (gitTopLevelCache.has(projectRoot)) return gitTopLevelCache.get(projectRoot)
  const result = run('git', ['-C', projectRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' })
  if (result.status !== 0) return undefined
  const value = result.stdout.trim()
  if (value === '') return undefined
  const resolved = resolve(value)
  gitTopLevelCache.set(projectRoot, resolved)
  return resolved
}

/**
 * The legacy review root under the OpenSpec directory.
 * @param projectRoot - absolute project root.
 * @returns absolute legacy review root.
 */
export function legacyReviewRoot(projectRoot) {
  return join(projectRoot, 'openspec', REVIEW_DIRECTORY)
}

/**
 * A stable suffix for a nested OpenSpec root.
 *
 * The top-level root has no suffix. A nested root hashes its POSIX path
 * relative to the worktree top level, so the main worktree and every linked
 * worktree compute the same name.
 * @param projectRoot - absolute project root.
 * @returns the suffix, or an empty string.
 */
export function nestedReviewRootSuffix(projectRoot) {
  const common = gitCommonDir(projectRoot)
  const top = gitTopLevel(projectRoot)
  if (common === undefined || top === undefined) return ''
  let topReal
  let rootReal
  try {
    topReal = realpathSync(top)
    rootReal = realpathSync(projectRoot)
  } catch {
    topReal = top
    rootReal = projectRoot
  }
  const value = relative(topReal, rootReal).split(sep).join('/')
  if (value === '' || value === '.') return ''
  if (value.startsWith('..') || isAbsolute(value)) return ''
  return `@root-${sha256(value).slice(0, 12)}`
}

/**
 * The review record name for one change.
 * @param projectRoot - absolute project root.
 * @param store - optional store id.
 * @param change - change name.
 * @returns the record name.
 */
export function reviewRecordName(projectRoot, store, change) {
  return `${reviewKey(store, change)}${nestedReviewRootSuffix(projectRoot)}`
}

/**
 * The primary review root for a project.
 *
 * A git project uses `<git common dir>/openspec-flow/review`; every other
 * project keeps `<projectRoot>/openspec/.review`.
 * @param projectRoot - absolute project root.
 * @returns absolute primary review root.
 */
export function reviewRoot(projectRoot) {
  const common = gitCommonDir(projectRoot)
  return common === undefined
    ? legacyReviewRoot(projectRoot)
    : join(common, 'openspec-flow', 'review')
}

/**
 * The primary record name for a legacy or key-shaped name.
 *
 * A key carries the separator by construction, so only the path-segment rule
 * applies here.
 * @param projectRoot - absolute project root.
 * @param key - `<store>#<change>` name.
 * @returns the primary record name.
 */
export function reviewRecordNameForKey(projectRoot, key) {
  return `${assertPathSegment(key, 'review key')}${nestedReviewRootSuffix(projectRoot)}`
}

/**
 * Whether a record has a migration marker.
 * @param projectRoot - absolute project root.
 * @param recordName - primary record name.
 * @returns true when the marker exists.
 */
export function hasReviewMigrationMarker(projectRoot, recordName) {
  return existsSync(migrationMarker(projectRoot, recordName))
}

/**
 * The legacy record directory for one change.
 * @param projectRoot - absolute project root.
 * @param store - optional store id.
 * @param change - change name.
 * @returns absolute legacy review directory.
 */
export function legacyReviewDirectory(projectRoot, store, change) {
  return join(legacyReviewRoot(projectRoot), reviewKey(store, change))
}

/** Sleep synchronously without a child process. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** The migration marker for one record. */
function migrationMarker(projectRoot, recordName) {
  return join(reviewRoot(projectRoot), '.migrated', recordName)
}

/** The migration lock for one record. */
function migrationLock(projectRoot, recordName) {
  return join(reviewRoot(projectRoot), '.migrate', `${recordName}.lock`)
}

/**
 * Copy a legacy record once into the primary root.
 * @param projectRoot - absolute project root.
 * @param recordName - primary record name.
 * @param legacy - legacy record directory.
 * @returns nothing.
 */
function migrateLegacyRecord(projectRoot, recordName, legacy) {
  const primary = reviewRoot(projectRoot)
  const directory = join(primary, recordName)
  const marker = migrationMarker(projectRoot, recordName)
  const lock = migrationLock(projectRoot, recordName)
  mkdirSync(join(primary, '.migrate'), { recursive: true })
  mkdirSync(join(primary, '.migrated'), { recursive: true })
  const deadline = Date.now() + 5_000
  for (;;) {
    try {
      mkdirSync(lock)
      break
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      if (Date.now() >= deadline) {
        throw new Error(`review record migration is busy at ${lock}; retry after it finishes`)
      }
      sleepSync(50)
    }
  }
  const temporary = join(primary, '.migrate', `${recordName}.tmp-${String(process.pid)}-${String(Date.now())}`)
  try {
    if (existsSync(directory) || existsSync(marker)) return
    cpSync(legacy, temporary, {
      recursive: true,
      filter: (source) => basename(source) !== '.lock',
    })
    writeFileSync(marker, `${JSON.stringify({ source: legacy, migratedAt: new Date().toISOString() })}\n`)
    try {
      renameSync(temporary, directory)
    } catch (error) {
      rmSync(marker, { force: true })
      throw error
    }
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true })
    throw new Error(`cannot migrate review record ${legacy} to ${directory} (lock ${lock}): ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    rmSync(lock, { recursive: true, force: true })
  }
}

/**
 * Copy a legacy record by its key and return the primary directory.
 * @param projectRoot - absolute project root.
 * @param key - `<store>#<change>` legacy record name.
 * @returns the primary review directory.
 */
export function migrateLegacyRecordByKey(projectRoot, key) {
  const recordName = reviewRecordNameForKey(projectRoot, key)
  const directory = join(reviewRoot(projectRoot), recordName)
  if (existsSync(directory)) return directory
  const legacy = join(legacyReviewRoot(projectRoot), key)
  if (!existsSync(legacy)) return directory
  migrateLegacyRecord(projectRoot, recordName, legacy)
  return directory
}

/**
 * The review directory for one change.
 *
 * A legacy record is copied once to the shared root before the path is
 * returned. A migration marker suppresses a copy after the shared record was
 * removed, so a user can restart a review.
 * @param projectRoot - absolute project root.
 * @param store - optional store id.
 * @param change - change name.
 * @returns absolute review directory.
 */
export function reviewDirectory(projectRoot, store, change) {
  const directory = join(reviewRoot(projectRoot), reviewRecordName(projectRoot, store, change))
  if (existsSync(directory)) return directory
  if (gitCommonDir(projectRoot) === undefined) return directory
  return migrateLegacyRecordByKey(projectRoot, reviewKey(store, change))
}

/**
 * Whether a directory is under the shared review root.
 * @param projectRoot - absolute project root.
 * @param directory - absolute review directory.
 * @returns true for the shared root, false for the legacy root or non-git.
 */
export function isSharedReviewDirectory(projectRoot, directory) {
  const common = gitCommonDir(projectRoot)
  if (common === undefined) return false
  const root = join(common, 'openspec-flow', 'review')
  const value = relative(root, resolve(directory))
  return value === '' || (!value.startsWith('..') && !isAbsolute(value))
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
 * List the files a commit changes against its first parent.
 *
 * The initial commit is compared with the empty tree, so every file it adds is
 * listed. A merge commit is compared with its first parent. Renames are
 * reported as the old path removed and the new path added.
 * @param root - project root.
 * @param rev - revision, default HEAD.
 * @returns changed paths, or undefined when git cannot resolve them.
 */
export function gitCommitPaths(root, rev = 'HEAD') {
  const commit = gitCommit(root, rev)
  if (commit === undefined) return undefined
  const parent = gitCommit(root, `${commit}^1`)
  const args = parent === undefined
    ? ['-C', root, 'diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '--no-renames', commit]
    : ['-C', root, 'diff-tree', '--no-commit-id', '--name-only', '-r', '--no-renames', parent, commit]
  const result = spawnSync('git', args, { encoding: 'utf8' })
  if (result.status !== 0) return undefined
  return result.stdout.split('\n').map((line) => line.trim()).filter((line) => line !== '')
}

/**
 * Ensure `openspec/.gitignore` contains `.review/`.
 *
 * The line is appended when missing. Existing unrelated lines are preserved;
 * the plugin owns only its own entry. When git already ignores the review
 * directory, no file is written, so a repository-level rule leaves the
 * worktree untouched.
 * @param projectRoot - absolute project root.
 * @param directory - absolute review directory; defaults to the project root's
 *   standard review root.
 * @returns nothing.
 * @throws when the ignore file cannot be written.
 */
export function ensureReviewIgnored(projectRoot, directory = join(projectRoot, 'openspec', REVIEW_DIRECTORY)) {
  if (isSharedReviewDirectory(projectRoot, directory)) return
  if (isGitRepository(projectRoot)) {
    const target = relative(projectRoot, directory)
    const result = spawnSync('git', ['-C', projectRoot, 'check-ignore', '-q', target], {
      encoding: 'utf8',
    })
    if (result.status === 0) return
  }
  const openspecDirectory = join(projectRoot, 'openspec')
  mkdirSync(openspecDirectory, { recursive: true })
  const file = join(openspecDirectory, '.gitignore')
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
  if (isSharedReviewDirectory(projectRoot, directory)) return
  if (!isGitRepository(projectRoot)) return
  ensureReviewIgnored(projectRoot, directory)
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

/**
 * Whether a worktree-relative path points at a change inside an
 * `openspec/changes/` directory.
 * @param path - worktree-relative path using POSIX separators.
 * @returns true when the path contains the change directory segment.
 */
export function isChangePath(path) {
  return /(^|\/)openspec\/changes\//u.test(path)
}

/**
 * Drop status lines that belong to another change's planning directory.
 *
 * The holder of an apply lock must not be blocked by a parallel draft's
 * uncommitted artifacts. A path under the reviewed change's own directory, or
 * one outside every `openspec/changes/` directory, still counts.
 * @param status - `git status --porcelain` output.
 * @param changeDirectory - worktree-relative directory of the reviewed change.
 * @returns the remaining non-empty lines.
 */
export function filterUnrelatedChangeStatus(status, changeDirectory) {
  const own = typeof changeDirectory === 'string' && changeDirectory !== ''
    ? changeDirectory
    : ''
  return status
    .split('\n')
    .filter((line) => line.trim() !== '')
    .filter((line) => {
      const path = statusLinePath(line)
      if (path === '') return true
      const underOwn = own !== '' && (path === own || path.startsWith(`${own}/`))
      if (underOwn) return true
      return !isChangePath(path)
    })
}
