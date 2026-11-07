/**
 * OpenSpec flow for DeepSeek Harness.
 *
 * Registers thirteen agent tools over an existing OpenSpec project, six
 * user-invocable skills, and one agent-scoped system prompt section that states
 * the OpenSpec stage gates. The tools keep the OpenSpec CLI as the authority for
 * schema, state and progress, but project its large `instructions apply`
 * payload down to the next task and one compact progress object. Marking a
 * task complete flips exactly one checkbox and updates the cached progress
 * without re-running the CLI, which removes the apply loop's repeated
 * O(N²) query.
 *
 * This module imports nothing from `@deepseek-ai/*` at runtime: a locally
 * linked bundle must not depend on bare-specifier resolution inside the
 * profile. Tools are plain `ToolDefinition` objects and the skill is a plain
 * `SkillRegistration`.
 *
 * @module dsh-openspec-flow
 */

import { registerPolicy } from './lib/policy.js'
import { registerSkillProvider } from './lib/skill.js'
import { registerTools } from './lib/tools/index.js'

/** Cordis plugin name. */
export const name = 'openspec-flow'

/** Services used by the plugin. */
export const inject = ['tools', 'subprocess', 'workingDirectory', 'systemPrompt', 'agents']

/** Settings resolved by the Standard Schema below. */
const DEFAULT_CONFIG = {
  timeoutMs: 30_000,
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
    /**
     * Validate and default the row config.
     * @param value - raw config from the profile's patch layer.
     * @returns the normalized config, or the reasons it was refused.
     */
    validate(value) {
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
      if (issues.length > 0) return { issues }
      return {
        value: {
          timeoutMs: input.timeoutMs ?? DEFAULT_CONFIG.timeoutMs,
        },
      }
    },
  },
}

/**
 * Register the tools and the skill on the plugin's context.
 * @param ctx - host context carrying tools, subprocess and workingDirectory.
 * @param config - validated row config.
 * @returns nothing; every registration is owned by the plugin's effect scope.
 */
export function apply(ctx, config) {
  const settings = {
    timeoutMs: Number.isInteger(config?.timeoutMs) ? config.timeoutMs : DEFAULT_CONFIG.timeoutMs,
  }
  registerTools(ctx, settings)
  registerSkillProvider(ctx)
  registerPolicy(ctx)
}
