/**
 * Finding-location scope for one change.
 *
 * A finding may point at the reviewed change, a main spec, code, documentation
 * or a section heading. A location that carries an `openspec/changes/` segment
 * at any depth is treated as a change location; another change's directory is
 * refused, and the concern belongs in `outOfScope`.
 *
 * @module dsh-openspec-flow/review/scope
 */

import { posix } from 'node:path'

/** The segment that marks a change location. */
const CHANGE_SEGMENT = /(?:^|\/)openspec\/changes\/(.+)$/u

/**
 * Strip a trailing line or line:column suffix from a location.
 * @param location - raw finding location.
 * @returns the path part.
 */
function withoutPosition(location) {
  return location.trim().replace(/:\d+(?::\d+)?\s*$/u, '')
}

/**
 * Normalize separators and `..` segments.
 * @param path - path text.
 * @returns the normalized path.
 */
function normalize(path) {
  return posix.normalize(path.replaceAll('\\', '/'))
}

/**
 * Identify the change named by a finding location when it is not the reviewed
 * change.
 *
 * A leading parent path is resolved from the change directory, so
 * `../other/tasks.md`, `./../other/tasks.md` and `specs/../../other/tasks.md`
 * are attributed. A location with no `openspec/changes/` segment is not a change
 * location and returns undefined.
 *
 * @param location - finding location.
 * @param change - reviewed change name.
 * @returns the other change (or `archive/<name>`) named by the location, or
 *   undefined when the location is not another change's.
 */
export function anotherChangeInLocation(location, change) {
  if (typeof location !== 'string' || location.trim() === '') return undefined
  if (typeof change !== 'string' || change === '') return undefined
  const path = normalize(withoutPosition(location))
  const resolved = path.startsWith('../')
    ? normalize(posix.join('openspec/changes', change, path))
    : path
  const match = CHANGE_SEGMENT.exec(resolved)
  if (match === null) return undefined
  const segments = match[1].split('/').filter((segment) => segment !== '')
  const first = segments[0]
  if (first === change) return undefined
  return first === 'archive' ? segments.slice(0, 2).join('/') : first
}
