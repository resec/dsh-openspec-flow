/**
 * The plugin's row config schema.
 *
 * The schema is hand-written because a linked install must not import
 * `@deepseek-ai/*` at runtime. It stays a pure, synchronous validator: shape and
 * bounds only. Whether a named model exists is answered by the live catalog at
 * save time, never here, because the profile layer applies this schema while the
 * LLM service may not even be mounted.
 *
 * @module dsh-openspec-flow/config
 */

import { normalizeReviews } from './review/config.js'

/** Default command deadline in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Validate and default the row config.
 * @param value - raw config from the profile's patch layer.
 * @returns the normalized config, or the reasons it was refused.
 */
export function validateConfig(value) {
  const input = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : {}
  const issues = []
  if (input.cliPath !== undefined) {
    issues.push({
      message: 'cliPath is no longer supported; the plugin runs its bundled OpenSpec CLI.',
    })
  }
  if (
    input.timeoutMs !== undefined
    && (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1_000 || input.timeoutMs > 300_000)
  ) {
    issues.push({ message: 'timeoutMs must be an integer between 1000 and 300000' })
  }
  const reviews = normalizeReviews(input.reviews)
  issues.push(...reviews.issues)
  if (issues.length > 0) return { issues }
  return {
    value: {
      timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      reviews: reviews.value,
    },
  }
}

/**
 * Hand-written Standard Schema for the bundle row's config.
 *
 * Deliberately not schemastery: importing it would be a runtime import of a
 * `@deepseek-ai/*` package, which a linked install cannot resolve reliably.
 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-openspec-flow',
    validate: validateConfig,
  },
}
