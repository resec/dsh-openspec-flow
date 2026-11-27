/**
 * Review entry resolution.
 *
 * One resolver serves both a parsed project review document and a locked
 * change policy. An entry is a name plus the profile whose `object` selects the
 * directory or tree flow; the entry name is only a label. This module keeps the
 * configured entry list and the unknown-entry refusal in one place, so the
 * tools, records, cards and lifecycle gates do not grow another name-specific
 * branch.
 *
 * @module dsh-openspec-flow/review/entry
 */

import { DEFAULT_PIPELINE } from './config.js'
import { reviewSection } from './config.js'

/** Entry used when a caller omits the review name. */
export const DEFAULT_ENTRY = 'draft'

/** A plain object, or undefined. */
function objectOf(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
}

/** Whether a value is a declared review object type. */
function objectType(value) {
  return value === 'directory' || value === 'tree' ? value : undefined
}

/** Normalize one review section without reading the project file. */
function sectionOf(raw) {
  return {
    enabled: raw?.enabled === true,
    reviewers: Number.isInteger(raw?.reviewers) ? raw.reviewers : 0,
    waitMinutes: Number.isInteger(raw?.waitMinutes) ? raw.waitMinutes : 15,
    reviewerModel: raw?.reviewerModel ?? { source: 'inherit' },
  }
}

/**
 * The configured entry names, in declaration order.
 * @param config - a parsed review document or a locked policy.
 * @returns the entry names.
 */
export function entryNames(config) {
  const entries = objectOf(config?.entries)
  if (entries !== undefined) return Object.keys(entries)
  const names = Object.keys(objectOf(config?.reviews) ?? {})
  if (names.length > 0) return names
  return ['draft', 'apply'].filter((name) => objectOf(config?.[name]) !== undefined)
}

/**
 * The pipeline role table, with the built-in defaults applied.
 * @param config - a parsed review document or a locked policy.
 * @returns `{ beforeApply, beforeArchive }`.
 */
export function pipelineOf(config) {
  const pipeline = objectOf(config?.pipeline) ?? {}
  return {
    beforeApply: typeof pipeline.beforeApply === 'string' && pipeline.beforeApply.trim() !== ''
      ? pipeline.beforeApply
      : DEFAULT_PIPELINE.beforeApply,
    beforeArchive: typeof pipeline.beforeArchive === 'string' && pipeline.beforeArchive.trim() !== ''
      ? pipeline.beforeArchive
      : DEFAULT_PIPELINE.beforeArchive,
  }
}

/**
 * Resolve one configured entry.
 *
 * A legacy policy without an entry `object` reads `draft` as directory and
 * `apply` as tree, matching the policy migration rule. Any other entry without
 * a declared object has no flow and is refused.
 * @param config - a parsed review document or a locked policy.
 * @param name - entry name.
 * @returns `{ name, profile, object, section }`.
 * @throws when the entry is not configured or has no declared object.
 */
export function resolveEntry(config, name) {
  const requested = typeof name === 'string' && name.trim() !== '' ? name.trim() : undefined
  const names = entryNames(config)
  const configured = requested !== undefined && names.includes(requested)
  if (!configured) {
    const listed = names.length === 0 ? 'none' : names.join(', ')
    throw new Error(`unknown review entry "${String(name)}"; configured entries: ${listed}`)
  }
  const reviewed = objectOf(config?.reviews)?.[requested]
  const raw = objectOf(config?.entries)?.[requested]
    ?? (objectOf(reviewed) !== undefined ? reviewed : objectOf(config?.[requested]))
  const section = objectOf(config?.entries) !== undefined
    ? reviewSection(config, requested)
    : sectionOf(raw)
  const declared = objectType(raw?.object)
  const fallback = requested === 'draft' ? 'directory' : requested === 'apply' ? 'tree' : undefined
  const object = declared ?? fallback
  if (object === undefined) {
    throw new Error(`review entry "${requested}" has no review object; expected "directory" or "tree"`)
  }
  return {
    name: requested,
    profile: objectOf(config?.entries) !== undefined
      ? raw
      : { object, ...section },
    object,
    section,
  }
}

/**
 * Resolve the entry named by one pipeline role.
 * @param config - a parsed review document or a locked policy.
 * @param role - `beforeApply` or `beforeArchive`.
 * @returns the resolved entry.
 */
export function gateEntry(config, role) {
  const pipeline = pipelineOf(config)
  return resolveEntry(config, pipeline[role])
}
