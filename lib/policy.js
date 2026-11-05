/**
 * The scoped OpenSpec flow policy.
 *
 * The policy is one agent-scoped system prompt section. It is registered only
 * through an agent's own context, so agents in projects without an OpenSpec
 * root never see it. The section text is evaluated at every assembly and
 * returns an empty string outside an OpenSpec project; the system prompt
 * registry drops empty sections, so a directory change needs no re-registration.
 *
 * This module imports nothing from `@deepseek-ai/*`: a linked bundle must not
 * depend on bare-specifier resolution inside the profile.
 *
 * @module dsh-openspec-flow/policy
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Section name; the only one this plugin registers. */
export const POLICY_SECTION = 'openspec-flow:policy'

/** Rule text contributed to an OpenSpec-project agent's system prompt. */
export const POLICY_TEXT = `## OpenSpec flow (this project)

This project uses OpenSpec. Drive every workflow step through the plugin's \`openspec_*\` tools; run the \`openspec\` CLI only when a tool is unavailable, and say why.

1. Clarify the request and its scope before proposing. Do not create a change while the requirements are ambiguous.
2. Before creating a change, state its kebab-case name, the artifacts it will produce, and the code it will affect, then wait for the user's explicit confirmation. Create it with \`openspec_new_change\`, never by hand.
3. Read each artifact instruction with \`openspec_instructions\` before writing proposal, specs, design or tasks, then run \`openspec_validate\` and stop. Do not edit implementation code until the user starts apply.
4. Apply with \`openspec_apply_next\` once, then \`openspec_mark_task_done\` after each task. Do not re-run \`openspec_apply_next\` between tasks.
5. Before reporting completion, run \`openspec_validate\` and the project's test suite, and report their results.
6. Archive only when the user explicitly asks, with \`openspec_archive\`. A finished apply is not a request to archive.
7. When the project has no \`.dsh/skills/openspec-*\`, \`openspec_init\` installs the skills and backs up official copies. Run it only when the user asks.`

/** Agents this module already attached, so both attachment paths are idempotent. */
const ATTACHED = new WeakSet()

/** Per-directory project detection cache; the key is the absolute directory. */
const PROJECT_CACHE = new Map()

/**
 * Report whether a directory contains an OpenSpec root.
 * @param cwd - absolute working directory, or undefined.
 * @returns true when `<cwd>/openspec` exists.
 */
export function isOpenSpecProject(cwd) {
  if (typeof cwd !== 'string' || cwd === '') return false
  const cached = PROJECT_CACHE.get(cwd)
  if (cached !== undefined) return cached
  const found = existsSync(join(cwd, 'openspec'))
  PROJECT_CACHE.set(cwd, found)
  return found
}

/**
 * Read an agent's committed working directory.
 * @param ctx - host context with the workingDirectory service.
 * @param agent - live agent whose session owns the directory.
 * @returns the absolute directory, or undefined when unavailable.
 */
function agentCwd(ctx, agent) {
  try {
    const directory = ctx.workingDirectory.get(agent.session)
    return typeof directory === 'string' && directory !== '' ? directory : undefined
  } catch {
    return undefined
  }
}

/**
 * Attach the policy section to one agent.
 *
 * The agent is captured in the section's text closure because the prompt
 * assembly context carries no agent identity. A second call for the same agent
 * is a no-op.
 *
 * @param ctx - host context carrying workingDirectory and the logger.
 * @param agent - live agent to attach to.
 * @returns nothing.
 */
export function attachPolicy(ctx, agent) {
  if (agent === undefined || agent === null) return
  if (ATTACHED.has(agent)) return
  const agentContext = agent.ctx
  const systemPrompt = agentContext?.systemPrompt ?? agentContext?.get?.('systemPrompt')
  if (
    agentContext === undefined
    || systemPrompt === undefined
    || typeof systemPrompt.section !== 'function'
  ) {
    ctx.logger?.warn?.(
      'openspec-flow: agent.ctx.systemPrompt is unavailable, so the flow policy is not attached.',
    )
    return
  }
  ATTACHED.add(agent)
  agentContext.effect(() => systemPrompt.section({
    name: POLICY_SECTION,
    order: systemPrompt.getSectionOrder('PLAN_POLICY'),
    text: () => (isOpenSpecProject(agentCwd(ctx, agent)) ? POLICY_TEXT : ''),
  }))
}

/**
 * Register the policy for new and already-live agents.
 *
 * A deployment without the agents service still receives new agents through
 * `agent/created`; the sweep is skipped.
 *
 * @param ctx - host context carrying systemPrompt and optionally agents.
 * @returns nothing; every registration is owned by the calling effect scope.
 */
export function registerPolicy(ctx) {
  const systemPrompt = ctx.systemPrompt ?? ctx.get?.('systemPrompt')
  if (systemPrompt === undefined || typeof systemPrompt.section !== 'function') {
    ctx.logger?.warn?.(
      'openspec-flow: ctx.systemPrompt is unavailable, so the flow policy is not registered.',
    )
    return
  }
  ctx.effect(() => ctx.on('agent/created', (payload) => {
    attachPolicy(ctx, payload?.agent)
  }))
  const agents = ctx.agents ?? ctx.get?.('agents')
  if (agents !== undefined && typeof agents.list === 'function') {
    for (const agent of agents.list()) attachPolicy(ctx, agent)
  }
}
