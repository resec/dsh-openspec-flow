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

This project uses OpenSpec. Drive every workflow step through the plugin's \`openspec_*\` tools. If a core tool is unavailable, report the missing tool and stop. \`openspec_init\`, \`openspec_store_list\` and \`openspec_schemas\` are management tools: they appear only after the user runs \`/opsx-admin\`, so ask the user for that command instead of reporting them missing.

1. Clarify the request and its scope before proposing. Do not create a change while the requirements are ambiguous.
2. Before creating a change, state its kebab-case name, the artifacts it will produce, and the code it will affect, then wait for the user's explicit confirmation. Create it with \`openspec_new_change\`, never by hand.
3. Read each artifact instruction with \`openspec_inspect\` (\`action: "instructions"\`) before writing proposal, specs, design or tasks, then run \`openspec_inspect\` with \`action: "validate"\` and stop. Do not edit implementation code until the user starts apply.
4. Before apply, run \`openspec_review\` with \`action: "start"\` and \`review: "draft"\`. \`start\` is the first round only; a later round uses \`action: "resume"\` without an intent. With \`reviewers: 0\`, read the returned brief and submit \`action: "self-report"\`; with \`reviewers: 1\`, call \`action: "wait"\`, end the turn when it returns \`waiting\`, and do not self-report; the reviewer submit or the deadline wakeup resumes you. Fix every blocker and finish the review before calling \`openspec_apply_next\`. Every draft round is reported by the plugin card: do not restate findings, evidence, impact, rules, failure paths, suggestions, residual risks, scope or notes; write one short note only for information the report cannot express and the user must know. The draft object is the change artifacts, not a commit or a git tree. In a git project, commit the change directory and, when the plugin wrote it, \`openspec/.gitignore\` once the draft review is ready and before the first apply; that seal commit is the apply base, and apply refuses a dirty tree, an unsealed HEAD or a mixed commit. Several changes may hold draft reviews at the same time; apply through archive is serial across changes, so another change's apply or archive is refused while this change holds an apply lock, and a paused change's lock is released only by the user, on request. The seal commit may also contain other \`openspec/changes/\` paths, but stage only this change directory and, when the plugin wrote it, \`openspec/.gitignore\`. A draft review can be resumed until apply starts; after that it is frozen.
5. Apply with \`openspec_apply_next\` once, then mark every finished task with \`openspec_mark_task_done\`, passing all their ids in \`taskIds\`. Do not re-run \`openspec_apply_next\` between tasks.
6. Before archive, commit the implementation and run \`openspec_review\` with \`action: "start"\` and \`review: "apply"\`. \`start\` is the first round; a later round uses \`action: "resume"\`. With \`reviewers: 0\`, read the returned brief and submit \`action: "self-report"\`; with \`reviewers: 1\`, call \`action: "wait"\`, end the turn when it returns \`waiting\`, and do not self-report; the reviewer submit or the deadline wakeup resumes you. Commit every round before the review. A plan change during apply needs the user's written approval, recorded with \`openspec_review\` (\`action: "waive"\`, \`scope: "plan-change"\`) before editing; apply review then reviews the changed planning artifacts. Fix every blocker. Every apply round is reported by the plugin card: do not restate findings, evidence, impact, rules, failure paths, suggestions, residual risks, scope or notes; write one short note only for information the report cannot express and the user must know. Another change's uncommitted planning files do not count as a dirty tree. The apply locks live in the domain's worktree git directory or \`openspec/.review/\`; a store change also locks its store domain, and a lock whose change or implementation root is gone is stale. A store change applied from another project is refused until the first project archives. The apply object is the committed git tree; a project without git has no apply review.
7. Before reporting completion, run \`openspec_inspect\` with \`action: "validate"\` and the project's test suite, and report their results.
8. Archive only when the user explicitly asks, with \`openspec_archive\`. When the change enables apply review and the project has git, archive only after that review is ready; a disabled or unavailable apply review does not hold archive. A finished apply is not a request to archive. A successful archive releases this change's apply locks; while another change holds one, archive is refused.
9. The plugin's workflow skills come from its skill provider; do not copy them into \`.dsh/skills/\`. \`openspec_init\` only creates the OpenSpec project structure. Run it only when the user asks, and only after \`/opsx-admin\` opens the management block.
10. Main specs are updated only by \`openspec_archive\`. There is no sync-only flow: do not edit \`openspec/specs/\` by hand, and do not load or follow a stale \`openspec-sync-specs\` skill. If the user asks to update main specs without archiving, say the flow is unsupported and offer to archive once the change is complete.`

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
  ctx.effect(() => {
    try {
      return systemPrompt.section({
        name: POLICY_SECTION,
        order: systemPrompt.getSectionOrder('PLAN_POLICY'),
        text: () => (isOpenSpecProject(agentCwd(ctx, agent)) ? POLICY_TEXT : ''),
      })
    } catch (error) {
      // A live reload can meet a section left by the previous plugin instance.
      // The section is agent-scoped, so it is not disposed with the old plugin;
      // keep the new instance active and report the stale section instead of
      // failing the whole plugin.
      ctx.logger?.warn?.(
        `openspec-flow: the flow policy could not attach to an existing agent: ${error instanceof Error ? error.message : String(error)}`,
      )
      return () => {}
    }
  })
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
