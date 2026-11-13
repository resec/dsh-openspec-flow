/**
 * Reviewer-only plugin entry.
 *
 * The `openspec-reviewer` preset composes this entry with read/search tools.
 * It registers only `openspec_reviewer`; the changer bundle does not.
 *
 * @module dsh-openspec-flow/reviewer
 */

import { registerReviewerTool } from './lib/review/reviewer-tool.js'

/** Cordis plugin name. */
export const name = 'openspec-flow-reviewer'

/** Services used by the reviewer entry. */
export const inject = ['tools', 'workingDirectory']

/**
 * Register the reviewer tool.
 * @param ctx - reviewer plugin context.
 * @returns nothing.
 */
export function apply(ctx) {
  registerReviewerTool(ctx)
}
