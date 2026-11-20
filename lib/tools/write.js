/**
 * Write tools: create a change, archive a change. Init lives in `lib/init.js`
 * because it also writes skills.
 *
 * @module dsh-openspec-flow/tools/write
 */

import { errorFromStatus, runOpenSpec, throwIfOnlyStatus, withStore } from '../openspec.js'
import { registerInitTool } from '../init.js'
import { releaseApplyLocks } from '../review/apply-lock.js'
import { modelResolver } from '../review/model.js'
import { ensurePolicy, removePolicy } from '../review/policy.js'
import { assertApplyReviewReady } from './review.js'
import { join, sep } from 'node:path'
import { gitCommonDir, isGitRepository } from '../review/store.js'
import { acquireLock, releaseLock } from '../worktree/lock.js'
import { readApplyState, mainWorktreeRoot } from '../worktree/state.js'
import { assertCreatedChangeSchema, assertNewChangeSchema, BUILTIN_SCHEMA } from '../schema.js'
import { projectArchive, projectNewChange, projectValidate } from '../state.js'
import {
  ROOT_SCHEMA,
  optionalStore,
  renderJson,
  requireChange,
  sessionCwd,
} from './shared.js'

/**
 * Register `openspec_new_change`.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
export function registerNewChangeTool(ctx, settings) {
  ctx.effect(() => ctx.tools.register({
    name: 'openspec_new_change',
    description: 'Create a new OpenSpec change directory with its .openspec.yaml metadata. Use it after the user confirms the change name and scope. Requires an existing OpenSpec root; it never initializes one.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          description: 'kebab-case change name, for example add-dark-mode.',
        },
        description: {
          type: 'string',
          description: 'Optional one-line description written to the change README.',
        },
        goal: {
          type: 'string',
          description: 'Optional goal metadata stored with the change.',
        },
        store: {
          type: 'string',
          description: 'Registered store id.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['change'],
        properties: {
          change: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'path', 'metadataPath', 'schema'],
            properties: {
              id: { type: 'string' },
              path: { type: 'string', description: 'Change directory relative to root.path.' },
              metadataPath: { type: 'string', description: 'Change metadata file relative to root.path.' },
              schema: { type: 'string' },
            },
          },
          root: ROOT_SCHEMA,
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const name = requireName(args)
      const store = optionalStore(args)
      const cwd = await sessionCwd(ctx, exec)

      // `new change` creates an implicit root when none exists. Probe first so
      // the tool keeps the same "never initialize" contract as the read tools.
      const probe = await runOpenSpec(ctx, settings, cwd, withStore(['list', '--json'], store), exec.signal)
      const root = probe.json !== null && typeof probe.json === 'object' ? probe.json.root : null
      if (!root) {
        throw new Error('No OpenSpec root found; run openspec_init first. openspec_new_change does not create a root.')
      }
      const rootPath = root.path

      // Reject an unsupported project selection or a shadowed built-in before
      // the create command runs, so a failed call leaves no change directory.
      assertNewChangeSchema(rootPath, name)

      const locked = ensurePolicy({
        projectRoot: rootPath,
        change: name,
        store,
        settings,
        gitEnabled: isGitRepository(rootPath),
        lockedBy: 'new-change',
        resolveModel: modelResolver({ ctx, agent: exec.agent }),
      })

      const command = ['new', 'change', name, '--schema', BUILTIN_SCHEMA, '--json']
      if (typeof args?.description === 'string' && args.description.trim() !== '') {
        command.push('--description', args.description.trim())
      }
      if (typeof args?.goal === 'string' && args.goal.trim() !== '') {
        command.push('--goal', args.goal.trim())
      }
      let created
      try {
        created = await runOpenSpec(
          ctx,
          settings,
          cwd,
          withStore(command, store),
          exec.signal,
        )
      } catch (error) {
        if (locked.created) removePolicy(locked.directory)
        throw error
      }
      const json = created.json
      throwIfOnlyStatus(json, ['change'])
      if (json.change === null || json.change === undefined || typeof json.change !== 'object') {
        if (Array.isArray(json.status) && json.status.length > 0) throw errorFromStatus(json.status)
        throw new Error('openspec new change returned no change.')
      }
      assertCreatedChangeSchema(json.change.schema, name)
      return projectNewChange(json, rootPath, name)
    },
  }))
}

/**
 * Register `openspec_archive`.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
export function registerArchiveTool(ctx, settings) {
  ctx.effect(() => ctx.tools.register({
    name: 'openspec_archive',
    description: 'Archive a completed OpenSpec change and merge its delta specs into the main specs. Refuses when tasks remain or validation fails, so nothing moves on a blocked archive. Pass skipSpecs for doc-only or tooling changes.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['change'],
      properties: {
        change: {
          type: 'string',
          description: 'Change name, exactly as the list action reports it.',
        },
        skipSpecs: {
          type: 'boolean',
          description: 'Skip main-spec updates for changes that do not alter spec-level behavior.',
        },
        store: {
          type: 'string',
          description: 'Registered store id.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['change', 'valid', 'archived'],
        properties: {
          change: { type: 'string' },
          valid: { type: 'boolean' },
          archived: { type: 'boolean' },
          archivedAs: { type: 'string' },
          path: { type: 'string', description: 'Archive directory relative to root.path.' },
          specsUpdated: { type: 'boolean' },
          totals: { type: 'object', additionalProperties: true },
          warnings: { type: 'array', items: { type: 'string' } },
          issues: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['level', 'path', 'message'],
              properties: {
                level: { type: 'string' },
                path: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
          root: ROOT_SCHEMA,
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const change = requireChange(args)
      const store = optionalStore(args)
      const cwd = await sessionCwd(ctx, exec)
      const gate = await assertApplyReviewReady(ctx, settings, cwd, change, store, exec.signal)
      if (isGitRepository(cwd)) {
        const mainRoot = mainWorktreeRoot(cwd) ?? cwd
        const state = readApplyState(mainRoot, store, change)
        const pluginRoot = join(mainRoot, '.cache', 'openspec-flow', 'worktrees') + sep
        if (state !== undefined && (state.status === 'active' || state.status === 'landing')
          && state.worktree.startsWith(pluginRoot)) {
          throw new Error(`the change '${change}' is applied in a plugin-created worktree; finish it with openspec_apply_worktree action=land instead of openspec_archive (the land action is provided by land-apply-worktree)`)
        }
      }
      const common = gitCommonDir(cwd)
      const lifecycle = common === undefined
        ? undefined
        : await acquireLock(common, 'lifecycle', { what: 'archive' })
      try {

      // `archive --yes` skips the CLI's incomplete-task prompt, so the tool
      // checks progress itself and leaves the change untouched when work remains.
      const list = await runOpenSpec(ctx, settings, cwd, withStore(['list', '--json'], store), exec.signal)
      const rootPath = list.json.root?.path ?? ''
      const changes = Array.isArray(list.json.changes) ? list.json.changes : []
      const entry = changes.find((candidate) => candidate.name === change)
      if (entry !== undefined) {
        const total = Number(entry.totalTasks) || 0
        const completed = Number(entry.completedTasks) || 0
        if (completed < total) {
          throw new Error(
            `Change '${change}' still has ${total - completed} incomplete task(s). Finish them before archiving.`,
          )
        }
      }

      const validation = await runOpenSpec(
        ctx,
        settings,
        cwd,
        withStore(['validate', change, '--json'], store),
        exec.signal,
      )
      throwIfOnlyStatus(validation.json, ['items'])
      const report = projectValidate(validation.json, change)
      if (!report.valid) {
        return { change, valid: false, archived: false, issues: report.issues }
      }

      const command = ['archive', change, '--yes', '--json']
      if (args?.skipSpecs === true) command.push('--skip-specs')
      const { json } = await runOpenSpec(ctx, settings, cwd, withStore(command, store), exec.signal)
      if (json.archive === null || json.archive === undefined || typeof json.archive !== 'object') {
        if (Array.isArray(json.status) && json.status.length > 0) throw errorFromStatus(json.status)
        throw new Error('openspec archive returned no archive result.')
      }
      const archived = projectArchive(json, change, rootPath, String(list.json.root.source ?? ''))
      releaseApplyLocks(gate.inspected.locks.filter((lock) => lock.mine))
      return archived
      } finally {
        if (lifecycle !== undefined) releaseLock(lifecycle)
      }
    },
  }))
}

/**
 * Register the write tools.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
export function registerWriteTools(ctx, settings) {
  registerNewChangeTool(ctx, settings)
  registerArchiveTool(ctx, settings)
  registerInitTool(ctx, settings)
}

/**
 * Validate and trim the required change name.
 * @param args - tool arguments.
 * @returns the name.
 */
function requireName(args) {
  const value = args?.name
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('A non-empty change name is required.')
  }
  return value.trim()
}
