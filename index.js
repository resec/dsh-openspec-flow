/**
 * OpenSpec flow for DeepSeek Harness.
 *
 * Registers thirteen agent tools over an existing OpenSpec project, five
 * user-invocable skills, and one agent-scoped system prompt section that states
 * the OpenSpec stage gates. Ten of the tools form the core change flow and stay
 * exposed; the three management tools stay hidden until the user runs
 * `/opsx-admin` for one turn. The tools keep the OpenSpec CLI as the authority for
 * schema, state and progress, but project its large `instructions apply`
 * payload down to the next task and one compact progress object. Marking tasks
 * complete flips their checkboxes in one call and updates the cached progress
 * without re-running the CLI, which removes the apply loop's repeated
 * O(N²) query.
 *
 * This module imports `@deepseek-ai/dsh-session` at runtime from the pinned
 * DSH version, because the review-card writer must commit plugin records
 * through the Host Session. Every other runtime import is a Node built-in or a
 * relative module; a locally linked bundle resolves the DSH package through
 * its declared dependency. Tools are plain `ToolDefinition` objects and the
 * skill is a plain `SkillRegistration`.
 *
 * @module dsh-openspec-flow
 */

import { registerAdminGate } from './lib/admin.js'
import { Config } from './lib/config.js'
import { registerCardProjection } from './lib/review/card-projection.js'
import { registerPolicy } from './lib/policy.js'
import { registerReviewChannel } from './lib/review/settings.js'
import { registerSkillProvider } from './lib/skill.js'
import { registerTools } from './lib/tools/index.js'
import { normalizeReviews } from './lib/review/config.js'
import { clearReviewDeadlines } from './lib/review/wakeup.js'

/** The row config schema, kept in `lib/config.js` so the channel validates with it too. */
export { Config }

/** Cordis plugin name. */
export const name = 'openspec-flow'

/** Services used by the plugin. */
export const inject = ['tools', 'subprocess', 'workingDirectory', 'systemPrompt', 'agents']

/**
 * Register the tools and the skill on the plugin's context.
 * @param ctx - host context carrying tools, subprocess and workingDirectory.
 * @param config - validated row config.
 * @returns nothing; every registration is owned by the plugin's effect scope.
 */
export function apply(ctx, config) {
  const settings = {
    timeoutMs: Number.isInteger(config?.timeoutMs) ? config.timeoutMs : 30_000,
    reviews: config?.reviews ?? normalizeReviews(undefined).value,
  }
  registerAdminGate(ctx)
  registerTools(ctx, settings)
  registerSkillProvider(ctx)
  registerPolicy(ctx)
  registerCardProjection(ctx)
  registerReviewChannel(ctx, settings)
  ctx.effect(() => () => clearReviewDeadlines())
}
