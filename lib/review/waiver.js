/**
 * Plan-change waiver path normalization.
 *
 * A plan-change waiver records change artifacts relative to the change
 * directory. The tool accepts a change-relative path, a project-relative path
 * under the change directory and an absolute path under the change directory,
 * and stores every entry in the change-relative form. An entry that escapes the
 * change directory or names another change is refused.
 *
 * @module dsh-openspec-flow/review/waiver
 */

import { isAbsolute, posix, relative, resolve, sep } from 'node:path'

/**
 * Normalize one entry to a change-relative POSIX path.
 * @param input - trimmed entry.
 * @param changeRoot - absolute change directory.
 * @param changePath - project-relative change directory, or undefined when the
 *   change directory is outside the project root.
 * @returns `{ path }` or `{ error }`.
 */
function normalizeEntry(input, changeRoot, changePath) {
  const slash = posix.normalize(input.replace(/\\/gu, '/'))
  const root = resolve(changeRoot)
  if (isAbsolute(slash)) {
    const rel = relative(root, resolve(slash)).split(sep).join('/')
    if (rel === '' || rel === '.' || rel.startsWith('..') || isAbsolute(rel)) {
      return { error: 'is outside the change directory' }
    }
    return { path: rel }
  }
  let candidate = slash
  if (changePath !== undefined && changePath !== '') {
    if (slash === changePath) return { error: 'is the change directory, not a file' }
    if (slash.startsWith(`${changePath}/`)) {
      candidate = slash.slice(changePath.length + 1)
    } else if (slash.startsWith('openspec/changes/')) {
      return { error: 'names another change' }
    } else if (slash.startsWith('openspec/')) {
      return { error: 'is outside the change directory' }
    }
  } else if (slash.startsWith('openspec/')) {
    return { error: 'is project-relative; pass a change-relative or absolute path' }
  }
  const normalized = posix.normalize(candidate)
  if (normalized === '' || normalized === '.' || normalized === '..'
    || normalized.startsWith('../') || isAbsolute(normalized)) {
    return { error: 'is outside the change directory' }
  }
  return { path: normalized }
}

/**
 * Normalize plan-change waiver files.
 *
 * The caller decides how to surface `refused`; a tool call turns its own
 * refused entries into one error, while a recorded or compared list drops
 * refused entries without failing.
 * @param files - raw entries.
 * @param options - `changeRoot` and `changePath`.
 * @returns `{ files, refused }` with sorted de-duplicated paths and entries
 *   carrying `{ input, reason }`.
 */
export function normalizeWaiverFiles(files, { changeRoot, changePath }) {
  const paths = []
  const refused = []
  for (const raw of Array.isArray(files) ? files : []) {
    if (typeof raw !== 'string') {
      refused.push({ input: String(raw), reason: 'is not a string' })
      continue
    }
    const value = raw.trim()
    if (value === '') {
      refused.push({ input: raw, reason: 'is empty' })
      continue
    }
    const result = normalizeEntry(value, changeRoot, changePath)
    if (result.error !== undefined) refused.push({ input: value, reason: result.error })
    else paths.push(result.path)
  }
  return { files: [...new Set(paths)].sort(), refused }
}
