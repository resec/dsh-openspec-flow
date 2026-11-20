/**
 * Parse the path columns of `git status --porcelain` and classify them for
 * packaging.
 *
 * The review store needs one path per line; the packaging gate needs every
 * path a line touches, so a rename cannot hide a published file. Both rules
 * live here so they cannot drift apart.
 *
 * @module dsh-openspec-flow/status-paths
 */

/** Prefix whose uncommitted paths a pack ignores. */
export const IGNORED_PACK_PREFIX = 'openspec/'

/**
 * Normalize a porcelain path to POSIX separators.
 * @param path - a path as git printed it.
 * @returns the path with backslashes replaced.
 */
export function normalizeStatusPath(path) {
  return path.replaceAll('\\', '/')
}

/**
 * Remove the quotes git adds to a path that holds special characters.
 * @param value - the raw column text.
 * @returns the unquoted, trimmed path.
 */
function unquote(value) {
  const trimmed = value.trim()
  if (trimmed.length > 1 && trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1)
  return trimmed
}

/**
 * The paths one status line touches: both sides of a rename, otherwise one.
 * @param line - one porcelain line.
 * @returns the non-empty paths, the destination last.
 */
export function statusLinePaths(line) {
  const text = line.length > 3 ? line.slice(3) : ''
  if (text.trim() === '') return []
  const arrow = text.indexOf(' -> ')
  const columns = arrow === -1 ? [text] : [text.slice(0, arrow), text.slice(arrow + 4)]
  return columns.map(unquote).filter((path) => path !== '')
}

/**
 * The destination path of one status line.
 * @param line - one porcelain line.
 * @returns the path, or an empty string when the line carries none.
 */
export function statusLinePath(line) {
  const paths = statusLinePaths(line)
  return paths.length === 0 ? '' : paths[paths.length - 1]
}

/**
 * Split dirty paths into the ones that block a pack and the `openspec/` ones
 * that cannot enter the tarball.
 * @param paths - dirty paths, for example from `statusLinePaths`.
 * @returns the blocking and ignored paths, each in input order.
 */
export function splitDirtyPaths(paths) {
  const blocking = []
  const ignored = []
  for (const path of paths) {
    const normalized = normalizeStatusPath(path)
    if (normalized === 'openspec' || normalized.startsWith(IGNORED_PACK_PREFIX)) ignored.push(normalized)
    else blocking.push(normalized)
  }
  return { blocking, ignored }
}
