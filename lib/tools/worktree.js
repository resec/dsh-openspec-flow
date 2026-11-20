/**
 * Apply worktree recovery tool.
 *
 * @module dsh-openspec-flow/tools/worktree
 */

import { gitCommonDir } from '../review/store.js'
import { recoverLock } from '../worktree/lock.js'
import { landApplyWorktree, removeApplyWorktree } from '../worktree/land.js'
import { optionalStore, renderJson, sessionCwd } from './shared.js'

/**
 * Register `openspec_apply_worktree`.
 * @param ctx - host context.
 * @returns nothing.
 */
export function registerApplyWorktreeTool(ctx, settings) {
  ctx.effect(() => ctx.tools.register({
    name: 'openspec_apply_worktree',
    description: 'Land an apply worktree and archive it, remove an archived plugin checkout, or recover a dead lifecycle/change lock. Inspect state and lock health with openspec_inspect action="worktree" first.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['recover', 'land', 'remove'],
          description: 'recover, land or remove.',
        },
        change: {
          type: 'string',
          description: 'Change name; required for the change lock scope.',
        },
        store: {
          type: 'string',
          description: 'Registered store id.',
        },
        scope: {
          type: 'string',
          enum: ['lifecycle', 'change'],
          description: 'Lock scope to recover.',
        },
        expectedOwner: {
          type: 'string',
          description: 'Owner token observed in the lock; recovery refuses a different owner.',
        },
        approvedBy: {
          type: 'string',
          enum: ['user'],
          description: 'Land requires user approval; abandon requires it too.',
        },
        abandon: {
          type: 'boolean',
          description: 'Remove an active checkout with user approval and a reason.',
        },
        reason: { type: 'string', description: 'Reason for abandoning an active checkout.' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          recovered: { type: 'boolean' },
          scope: { type: 'string' },
          change: { type: 'string' },
          mergeCommit: { type: 'string' },
          archiveCommit: { type: 'string' },
          manifest: { type: 'string' },
          removed: { type: 'boolean' },
          path: { type: 'string' },
          branch: { type: 'string' },
          cleanup: {
            type: 'object',
            additionalProperties: false,
            required: ['complete', 'worktreeRemoved', 'branchRemoved'],
            properties: {
              complete: { type: 'boolean' },
              worktreeRemoved: { type: 'boolean' },
              branchRemoved: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
          store: { type: 'string' },
          applyReviewId: { type: 'string' },
          reviewRecordHash: { type: 'string' },
          worktree: { type: 'string' },
          featureHead: { type: 'string' },
          featureTree: { type: 'string' },
          mainHead: { type: 'string' },
          approvedBy: { type: 'string' },
          landedAt: { type: 'string' },
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const action = args?.action
      const cwd = await sessionCwd(ctx, exec)
      const store = optionalStore(args)
      if (action === 'land' || action === 'remove') {
        const change = typeof args?.change === 'string' && args.change.trim() !== ''
          ? args.change.trim()
          : undefined
        if (change === undefined) throw new Error(`${action} requires a non-empty change`)
        if (action === 'land') {
          return await landApplyWorktree(ctx, settings, {
            cwd, change, store, approvedBy: args?.approvedBy, signal: exec.signal,
          })
        }
        return await removeApplyWorktree(ctx, settings, {
          cwd, change, store, abandon: args?.abandon === true,
          reason: args?.reason, approvedBy: args?.approvedBy,
        })
      }
      if (action !== 'recover') {
        throw new Error(`Unsupported action '${String(action)}'; use recover, land or remove.`)
      }
      const common = gitCommonDir(cwd)
      if (common === undefined) throw new Error('apply worktree recovery is unavailable outside a git repository')
      const change = typeof args?.change === 'string' && args.change.trim() !== '' ? args.change.trim() : undefined
      const scope = args?.scope
      const expectedOwner = args?.expectedOwner
      return recoverLock(common, scope, { store, change, expectedOwner })
    },
  }))
}
