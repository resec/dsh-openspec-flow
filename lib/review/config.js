/**
 * Review configuration normalization.
 *
 * The plugin keeps two review sections: draft and apply. The independent
 * reviewer and the configuration page are separate changes; this module
 * deliberately accepts only the settings those later changes will extend.
 *
 * @module dsh-openspec-flow/review/config
 */

/** Default draft review settings. */
export const DEFAULT_DRAFT_REVIEW = {
  enabled: true,
  reviewers: 0,
  maxRounds: 3,
  waitMinutes: 15,
}

/** Default apply review settings. */
export const DEFAULT_APPLY_REVIEW = {
  enabled: true,
  reviewers: 0,
  maxRounds: 5,
  waitMinutes: 15,
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
    if (!['enabled', 'reviewers', 'maxRounds', 'waitMinutes'].includes(key)) {
      issues.push({ message: `${label}.${key} is not supported` })
    }
  }
  return {
    enabled: booleanSetting(input.enabled, defaults.enabled, `${label}.enabled`, issues),
    reviewers: integerSetting(input.reviewers, defaults.reviewers, `${label}.reviewers`, 0, 1, issues),
    maxRounds: integerSetting(input.maxRounds, defaults.maxRounds, `${label}.maxRounds`, 1, 50, issues),
    waitMinutes: integerSetting(input.waitMinutes, defaults.waitMinutes, `${label}.waitMinutes`, 1, 120, issues),
  }
}

/**
 * Normalize the `reviews` object.
 *
 * `reviewers` currently accepts 0 only: the independent reviewer arrives in a
 * later change. A value above 0 is refused here rather than failing at start.
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
    maxRounds: Number.isInteger(section?.maxRounds) ? section.maxRounds : defaults.maxRounds,
    waitMinutes: Number.isInteger(section?.waitMinutes) ? section.waitMinutes : defaults.waitMinutes,
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
