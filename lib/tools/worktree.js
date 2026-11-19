/**
 * Apply worktree recovery tool.
 *
 * @module dsh-openspec-flow/tools/worktree
 */

import { gitCommonDir } from '../review/store.js'
import { recoverLock } from '../worktree/lock.js'
import { optionalStore, renderJson, sessionCwd } from './shared.js'

/**
 * Register `openspec_apply_worktree`.
 * @param ctx - host context.
 * @returns nothing.
 */
export function registerApplyWorktreeTool(ctx) {
  ctx.effect(() => ctx.tools.register({
    name: 'openspec_apply_worktree',
    description: 'Recover a dead apply worktree lifecycle or change lock after an explicit compare-and-delete. Inspect the state and lock health with openspec_inspect action="worktree" first. This tool does not create, remove or land worktrees.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['recover'],
          description: 'Recovery action.',
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
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['recovered', 'scope'],
        properties: {
          recovered: { type: 'boolean' },
          scope: { type: 'string' },
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      if (args?.action !== 'recover') {
        throw new Error(`Unsupported action '${String(args?.action)}'; use recover.`)
      }
      const cwd = await sessionCwd(ctx, exec)
      const common = gitCommonDir(cwd)
      if (common === undefined) throw new Error('apply worktree recovery is unavailable outside a git repository')
      const change = typeof args?.change === 'string' && args.change.trim() !== '' ? args.change.trim() : undefined
      const store = optionalStore(args)
      const scope = args?.scope
      const expectedOwner = args?.expectedOwner
      return recoverLock(common, scope, { store, change, expectedOwner })
    },
  }))
}
