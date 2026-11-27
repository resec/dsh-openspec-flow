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

/** Pipeline roles used when the document omits a role. */
export const DEFAULT_PIPELINE = { beforeApply: 'draft', beforeArchive: 'apply' }

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
  pipeline: { ...DEFAULT_PIPELINE },
}

/** Review object types a profile may declare. */
export const OBJECT_TYPES = ['directory', 'tree']

/** Pattern an entry name must match. */
export const ENTRY_NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/** Pipeline roles the document may declare. */
export const PIPELINE_KEYS = ['beforeApply', 'beforeArchive']

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
    if (!['profiles', 'reviews', 'pipeline'].includes(key)) {
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
  const rawEntries = objectOf(input.reviews)
  if (input.reviews !== undefined && rawEntries === undefined) {
    issues.push({ message: 'reviews must be an object' })
  }
  const reviews = {}
  for (const [entry, rawName] of Object.entries(rawEntries ?? {})) {
    if (!ENTRY_NAME_PATTERN.test(entry)) {
      issues.push({ message: `reviews.${entry} is not a kebab-case entry name` })
      continue
    }
    const name = nonEmpty(rawName)
    if (name === undefined) {
      issues.push({ message: `reviews.${entry} must name a profile` })
      continue
    }
    if (profiles[name] === undefined) {
      issues.push({ message: `reviews.${entry} names profile "${name}", which profiles does not declare` })
      continue
    }
    reviews[entry] = name
  }
  const entries = {}
  for (const [entry, name] of Object.entries(reviews)) {
    entries[entry] = profiles[name]
  }
  const rawPipeline = input.pipeline
  const pipelineWasOmitted = rawPipeline === undefined
  let pipeline
  if (rawPipeline === undefined) {
    pipeline = { ...DEFAULT_PIPELINE }
  } else {
    const rawRoles = objectOf(rawPipeline)
    if (rawRoles === undefined) {
      issues.push({ message: 'pipeline must be an object' })
      pipeline = { ...DEFAULT_PIPELINE }
    } else {
      for (const key of Object.keys(rawRoles)) {
        if (!PIPELINE_KEYS.includes(key)) {
          issues.push({ message: `pipeline.${key} is not supported; use beforeApply or beforeArchive` })
        }
      }
      pipeline = {}
      for (const role of PIPELINE_KEYS) {
        const rawRole = rawRoles[role]
        if (rawRole === undefined) {
          pipeline[role] = DEFAULT_PIPELINE[role]
          continue
        }
        const name = nonEmpty(rawRole)
        if (name === undefined) {
          issues.push({ message: `pipeline.${role} must be a non-empty string` })
          pipeline[role] = DEFAULT_PIPELINE[role]
          continue
        }
        pipeline[role] = name
      }
    }
  }
  const requiredObjects = { beforeApply: 'directory', beforeArchive: 'tree' }
  for (const role of PIPELINE_KEYS) {
    const name = pipeline[role]
    if (!Object.hasOwn(reviews, name)) {
      if (pipelineWasOmitted && name === DEFAULT_PIPELINE[role]) {
        issues.push({ message: `reviews.${name} is required and must name a profile` })
      } else {
        issues.push({ message: `pipeline.${role} names entry "${name}", which reviews does not declare` })
      }
      continue
    }
    const expected = requiredObjects[role]
    if (entries[name]?.object !== expected) {
      issues.push({
        message: `pipeline.${role} names entry "${name}", whose object is "${String(entries[name]?.object)}"; it must be a "${expected}" entry`,
      })
    }
  }
  if (issues.length > 0) return { value: undefined, issues }
  return {
    value: {
      profiles,
      reviews,
      entries,
      pipeline,
      ...(entries.draft === undefined ? {} : { draft: entries.draft }),
      ...(entries.apply === undefined ? {} : { apply: entries.apply }),
    },
    issues,
  }
}

/**
 * Read one resolved profile section from a parsed review document.
 * @param config - parsed document.
 * @param kind - `draft` or `apply`.
 * @returns the profile section.
 */
export function reviewSection(config, kind) {
  const section = config?.entries?.[kind] ?? config?.[kind]
  return {
    enabled: section?.enabled === true,
    reviewers: Number.isInteger(section?.reviewers) ? section.reviewers : 0,
    waitMinutes: Number.isInteger(section?.waitMinutes) ? section.waitMinutes : 15,
    reviewerModel: normalizeReviewerModel(section?.reviewerModel, `reviews.${kind}.reviewerModel`, []),
  }
}
