/**
 * Review configuration shape normalization.
 *
 * The project review file supplies every parameter: named profiles that
 * declare a review object type plus the review parameters, and two entries
 * that name a profile for draft and for apply. This module keeps the pure
 * shape and bounds rules shared by the file reader, the policy lock and the
 * default document that `openspec_init` writes.
 *
 * @module dsh-openspec-flow/review/config
 */

/** Default reviewer model: follow the changer's current selection. */
export const DEFAULT_REVIEWER_MODEL = { source: 'inherit' }

/** Default draft review settings written by `openspec_init`. */
export const DEFAULT_DRAFT_REVIEW = {
  enabled: true,
  reviewers: 0,
  waitMinutes: 15,
  reviewerModel: DEFAULT_REVIEWER_MODEL,
}

/** Default apply review settings written by `openspec_init`. */
export const DEFAULT_APPLY_REVIEW = {
  enabled: true,
  reviewers: 0,
  waitMinutes: 15,
  reviewerModel: DEFAULT_REVIEWER_MODEL,
}

/** Profile names the default document declares. */
export const DEFAULT_DIRECTORY_PROFILE = 'standard-directory'

/** Profile name the default document uses for apply review. */
export const DEFAULT_TREE_PROFILE = 'standard-tree'

/** The review document `openspec_init` writes when none exists. */
export const DEFAULT_REVIEW_CONFIG = {
  profiles: {
    [DEFAULT_DIRECTORY_PROFILE]: { object: 'directory', ...DEFAULT_DRAFT_REVIEW },
    [DEFAULT_TREE_PROFILE]: { object: 'tree', ...DEFAULT_APPLY_REVIEW },
  },
  reviews: {
    draft: DEFAULT_DIRECTORY_PROFILE,
    apply: DEFAULT_TREE_PROFILE,
  },
}

/** Review object types a profile may declare. */
export const OBJECT_TYPES = ['directory', 'tree']

/** Entry names the document may carry. */
const ENTRY_NAMES = ['draft', 'apply']

/** Parameter keys a profile carries beside `object`. */
const PROFILE_PARAMETER_KEYS = ['enabled', 'reviewers', 'waitMinutes', 'reviewerModel']

/** Non-empty trimmed string, or undefined. */
function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** A plain object, or undefined. */
function objectOf(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
}

/**
 * Normalize one reviewer model setting.
 *
 * An explicit model needs a provider and a model; the reasoning effort is
 * optional because a model may expose no selectable effort. An inherited model
 * carries no concrete route: that is resolved when the change locks its policy.
 * @param raw - raw setting value.
 * @param label - section path.
 * @param issues - collector.
 * @returns the normalized setting.
 */
export function normalizeReviewerModel(raw, label, issues) {
  if (raw === undefined) return { ...DEFAULT_REVIEWER_MODEL }
  const input = objectOf(raw)
  if (input === undefined) {
    issues.push({ message: `${label} must be an object` })
    return { ...DEFAULT_REVIEWER_MODEL }
  }
  for (const key of Object.keys(input)) {
    if (!['source', 'provider', 'model', 'reasoningEffort'].includes(key)) {
      issues.push({ message: `${label}.${key} is not supported` })
    }
  }
  const source = input.source === undefined ? 'inherit' : input.source
  if (source !== 'inherit' && source !== 'explicit') {
    issues.push({ message: `${label}.source must be "inherit" or "explicit"` })
    return { ...DEFAULT_REVIEWER_MODEL }
  }
  if (source === 'inherit') {
    for (const key of ['provider', 'model', 'reasoningEffort']) {
      if (input[key] !== undefined) {
        issues.push({ message: `${label}.${key} is not allowed when source is "inherit"` })
      }
    }
    return { source: 'inherit' }
  }
  const provider = nonEmpty(input.provider)
  const model = nonEmpty(input.model)
  if (provider === undefined) issues.push({ message: `${label}.provider must be a non-empty string` })
  if (model === undefined) issues.push({ message: `${label}.model must be a non-empty string` })
  const reasoningEffort = nonEmpty(input.reasoningEffort)
  if (input.reasoningEffort !== undefined && reasoningEffort === undefined) {
    issues.push({ message: `${label}.reasoningEffort must be a non-empty string` })
  }
  return {
    source: 'explicit',
    provider: provider ?? '',
    model: model ?? '',
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
  }
}

/**
 * Normalize one profile. Every parameter is required; nothing is defaulted,
 * because a missing parameter must fail the read instead of silently locking
 * a built-in value.
 * @param raw - raw profile value.
 * @param label - profile path.
 * @param issues - collector.
 * @returns the normalized profile.
 */
export function normalizeProfile(raw, label, issues) {
  const input = objectOf(raw) ?? {}
  for (const key of Object.keys(input)) {
    if (key !== 'object' && !PROFILE_PARAMETER_KEYS.includes(key)) {
      issues.push({ message: `${label}.${key} is not supported` })
    }
  }
  if (input.object !== 'directory' && input.object !== 'tree') {
    issues.push({ message: `${label}.object must be "directory" or "tree"` })
  }
  if (input.enabled === undefined) {
    issues.push({ message: `${label}.enabled is required` })
  } else if (typeof input.enabled !== 'boolean') {
    issues.push({ message: `${label}.enabled must be a boolean` })
  }
  if (input.reviewers === undefined) {
    issues.push({ message: `${label}.reviewers is required` })
  } else if (!Number.isInteger(input.reviewers) || input.reviewers < 0 || input.reviewers > 1) {
    issues.push({ message: `${label}.reviewers must be 0 or 1` })
  }
  if (input.waitMinutes === undefined) {
    issues.push({ message: `${label}.waitMinutes is required` })
  } else if (!Number.isInteger(input.waitMinutes) || input.waitMinutes < 1 || input.waitMinutes > 120) {
    issues.push({ message: `${label}.waitMinutes must be an integer between 1 and 120` })
  }
  if (input.reviewerModel === undefined) {
    issues.push({ message: `${label}.reviewerModel is required` })
  }
  return {
    object: input.object,
    enabled: input.enabled === true,
    reviewers: Number.isInteger(input.reviewers) ? input.reviewers : 0,
    waitMinutes: Number.isInteger(input.waitMinutes) ? input.waitMinutes : 15,
    reviewerModel: normalizeReviewerModel(input.reviewerModel, `${label}.reviewerModel`, issues),
  }
}

/**
 * Normalize a parsed review document (outside the file read).
 * @param raw - raw document value.
 * @returns `{ value, issues }`.
 */
export function normalizeReviewDocument(raw) {
  const issues = []
  const input = objectOf(raw)
  if (input === undefined) {
    return { value: undefined, issues: [{ message: 'the review configuration must be a JSON object' }] }
  }
  for (const key of Object.keys(input)) {
    if (key !== 'profiles' && key !== 'reviews') {
      issues.push({ message: `${key} is not supported at the top level` })
    }
  }
  const rawProfiles = objectOf(input.profiles)
  const profiles = {}
  if (rawProfiles === undefined || Object.keys(rawProfiles).length === 0) {
    issues.push({ message: 'profiles must be a non-empty object' })
  } else {
    for (const [name, rawProfile] of Object.entries(rawProfiles)) {
      profiles[name] = normalizeProfile(rawProfile, `profiles.${name}`, issues)
    }
  }
  const rawEntries = objectOf(input.reviews) ?? {}
  for (const key of Object.keys(rawEntries)) {
    if (!ENTRY_NAMES.includes(key)) {
      issues.push({ message: `reviews.${key} is not a supported review entry; use draft or apply` })
    }
  }
  const reviews = {}
  const resolved = {}
  for (const kind of ENTRY_NAMES) {
    const name = nonEmpty(rawEntries[kind])
    if (name === undefined) {
      issues.push({ message: `reviews.${kind} is required and must name a profile` })
      continue
    }
    const profile = profiles[name]
    if (profile === undefined) {
      issues.push({ message: `reviews.${kind} names profile "${name}", which profiles does not declare` })
      continue
    }
    const expected = kind === 'draft' ? 'directory' : 'tree'
    if (profile.object !== expected) {
      issues.push({
        message: `reviews.${kind} must name a profile whose object is "${expected}", but "${name}" declares "${String(profile.object)}"`,
      })
      continue
    }
    reviews[kind] = name
    resolved[kind] = profile
  }
  if (issues.length > 0) return { value: undefined, issues }
  return { value: { profiles, reviews, draft: resolved.draft, apply: resolved.apply }, issues }
}

/**
 * Read one resolved profile section from a parsed review document.
 * @param config - parsed document.
 * @param kind - `draft` or `apply`.
 * @returns the profile section.
 */
export function reviewSection(config, kind) {
  const section = config?.[kind]
  return {
    enabled: section?.enabled === true,
    reviewers: Number.isInteger(section?.reviewers) ? section.reviewers : 0,
    waitMinutes: Number.isInteger(section?.waitMinutes) ? section.waitMinutes : 15,
    reviewerModel: normalizeReviewerModel(section?.reviewerModel, `reviews.${kind}.reviewerModel`, []),
  }
}
