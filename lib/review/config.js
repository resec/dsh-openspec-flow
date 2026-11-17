/**
 * Review configuration normalization.
 *
 * The plugin keeps two review sections: draft and apply. Each section carries
 * the reviewer model as a source plus, for an explicit choice, the provider,
 * model and reasoning effort. `inherit` is resolved when a change locks its
 * policy, so this module only validates the shape it is given.
 *
 * @module dsh-openspec-flow/review/config
 */

/** Default reviewer model: follow the changer's current selection. */
export const DEFAULT_REVIEWER_MODEL = { source: 'inherit' }

/** Default draft review settings. */
export const DEFAULT_DRAFT_REVIEW = {
  enabled: true,
  reviewers: 0,
  waitMinutes: 15,
  reviewerModel: DEFAULT_REVIEWER_MODEL,
}

/** Default apply review settings. */
export const DEFAULT_APPLY_REVIEW = {
  enabled: true,
  reviewers: 0,
  waitMinutes: 15,
  reviewerModel: DEFAULT_REVIEWER_MODEL,
}

/** Non-empty trimmed string, or undefined. */
function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
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
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    issues.push({ message: `${label} must be an object` })
    return { ...DEFAULT_REVIEWER_MODEL }
  }
  for (const key of Object.keys(raw)) {
    if (!['source', 'provider', 'model', 'reasoningEffort'].includes(key)) {
      issues.push({ message: `${label}.${key} is not supported` })
    }
  }
  const source = raw.source === undefined ? 'inherit' : raw.source
  if (source !== 'inherit' && source !== 'explicit') {
    issues.push({ message: `${label}.source must be "inherit" or "explicit"` })
    return { ...DEFAULT_REVIEWER_MODEL }
  }
  if (source === 'inherit') {
    for (const key of ['provider', 'model', 'reasoningEffort']) {
      if (raw[key] !== undefined) {
        issues.push({ message: `${label}.${key} is not allowed when source is "inherit"` })
      }
    }
    return { source: 'inherit' }
  }
  const provider = nonEmpty(raw.provider)
  const model = nonEmpty(raw.model)
  if (provider === undefined) issues.push({ message: `${label}.provider must be a non-empty string` })
  if (model === undefined) issues.push({ message: `${label}.model must be a non-empty string` })
  const reasoningEffort = nonEmpty(raw.reasoningEffort)
  if (raw.reasoningEffort !== undefined && reasoningEffort === undefined) {
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
 * Normalize one boolean setting.
 * @param value - raw value.
 * @param fallback - default.
 * @param label - diagnostic path.
 * @param issues - collector.
 * @returns the boolean.
 */
function booleanSetting(value, fallback, label, issues) {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') issues.push({ message: `${label} must be a boolean` })
  return value
}

/**
 * Normalize one bounded integer setting.
 * @param value - raw value.
 * @param fallback - default.
 * @param label - diagnostic path.
 * @param min - lower bound.
 * @param max - upper bound.
 * @param issues - collector.
 * @returns the integer.
 */
function integerSetting(value, fallback, label, min, max, issues) {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < min || value > max) {
    issues.push({ message: `${label} must be an integer between ${String(min)} and ${String(max)}` })
  }
  return value
}

/**
 * Normalize one review section.
 * @param raw - raw section value.
 * @param defaults - section defaults.
 * @param label - section path.
 * @param issues - collector.
 * @returns the normalized section.
 */
function normalizeSection(raw, defaults, label, issues) {
  const input = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {}
  for (const key of Object.keys(input)) {
    // A legacy maxRounds is accepted and dropped from the normalized value.
    if (!['enabled', 'reviewers', 'maxRounds', 'waitMinutes', 'reviewerModel'].includes(key)) {
      issues.push({ message: `${label}.${key} is not supported` })
    }
  }
  return {
    enabled: booleanSetting(input.enabled, defaults.enabled, `${label}.enabled`, issues),
    reviewers: integerSetting(input.reviewers, defaults.reviewers, `${label}.reviewers`, 0, 1, issues),
    waitMinutes: integerSetting(input.waitMinutes, defaults.waitMinutes, `${label}.waitMinutes`, 1, 120, issues),
    reviewerModel: normalizeReviewerModel(
      input.reviewerModel,
      `${label}.reviewerModel`,
      issues,
    ),
  }
}

/**
 * Normalize the `reviews` object.
 *
 * `reviewers` accepts 0 or 1: 0 is self-review and 1 is one independent
 * reviewer. A value above 1 is refused here rather than failing at start.
 * @param value - raw `reviews` value.
 * @returns `{ value, issues }`.
 */
export function normalizeReviews(value) {
  const input = typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
  const issues = []
  for (const key of Object.keys(input)) {
    if (key !== 'draft' && key !== 'apply') issues.push({ message: `reviews.${key} is not supported` })
  }
  return {
    value: {
      draft: normalizeSection(input.draft, DEFAULT_DRAFT_REVIEW, 'reviews.draft', issues),
      apply: normalizeSection(input.apply, DEFAULT_APPLY_REVIEW, 'reviews.apply', issues),
    },
    issues,
  }
}

/**
 * Read one normalized review section from plugin settings.
 * @param settings - plugin settings.
 * @param kind - `draft` or `apply`.
 * @param defaults - fallback defaults.
 * @returns the section.
 */
function settingsFor(settings, kind, defaults) {
  const section = settings?.reviews?.[kind]
  return {
    enabled: section?.enabled === true,
    reviewers: Number.isInteger(section?.reviewers) ? section.reviewers : defaults.reviewers,
    waitMinutes: Number.isInteger(section?.waitMinutes) ? section.waitMinutes : defaults.waitMinutes,
    reviewerModel: normalizeReviewerModel(section?.reviewerModel, `reviews.${kind}.reviewerModel`, []),
  }
}

/**
 * Read the normalized draft settings from plugin settings.
 * @param settings - plugin settings.
 * @returns the draft settings.
 */
export function draftSettings(settings) {
  return settingsFor(settings, 'draft', DEFAULT_DRAFT_REVIEW)
}

/**
 * Read the normalized apply settings from plugin settings.
 * @param settings - plugin settings.
 * @returns the apply settings.
 */
export function applySettings(settings) {
  return settingsFor(settings, 'apply', DEFAULT_APPLY_REVIEW)
}
