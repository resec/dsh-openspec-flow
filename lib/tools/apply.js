/**
 * Apply-loop tools: start/resume apply and mark one or more tasks done.
 *
 * @module dsh-openspec-flow/tools/apply
 */

import { isAbsolute, resolve } from 'node:path'
import { commitMarks, ensureEntry, loadApplyState, projectApply, projectMark, resolveMarks } from '../state.js'
import {
  APPLY_STATE_SCHEMA,
  CONTEXT_FILES_SCHEMA,
  INSTRUCTION_SCHEMA,
  MARK_STATE_SCHEMA,
  NEXT_SCHEMA,
  PROGRESS_SCHEMA,
  ROOT_SCHEMA,
  markInterrupted,
  optionalLine,
  optionalSourcePath,
  optionalStore,
  renderJson,
  requireChange,
  requireTaskIds,
  sessionCwd,
  taskNotFound,
} from './shared.js'

/**
 * Register `openspec_apply_next`.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
export function registerApplyNextTool(ctx, settings) {
  ctx.effect(() => ctx.tools.register({
    name: 'openspec_apply_next',
    description: 'Start or resume OpenSpec apply in one compact call: state, progress, the next pending task with its exact file and line, context files, the current step\'s instruction, and the project context and apply guidance when configured. Call it once per apply session; after each task or batch use openspec_mark_task_done instead of calling this again. Only the built-in spec-driven schema is supported; custom or shadowed schemas are rejected.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['change'],
      properties: {
        change: {
          type: 'string',
          description: 'Change name, exactly as the list action reports it.',
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
        required: ['change', 'schema', 'state', 'progress', 'taskCount', 'contextFiles'],
        properties: {
          change: { type: 'string' },
          schema: { type: 'string' },
          state: APPLY_STATE_SCHEMA,
          progress: PROGRESS_SCHEMA,
          taskCount: {
            type: 'number',
            description: 'Tasks with text after the checkbox. Text-less checkboxes count in progress but not here.',
          },
          next: NEXT_SCHEMA,
          contextFiles: CONTEXT_FILES_SCHEMA,
          instruction: INSTRUCTION_SCHEMA,
          context: {
            type: 'string',
            description: 'Project context from openspec/config.yaml when configured; it applies to the apply operation.',
          },
          guidance: {
            type: 'array',
            items: { type: 'string' },
            description: 'Apply guidance from openspec/config.yaml when configured.',
          },
          root: ROOT_SCHEMA,
          missingArtifacts: {
            type: 'array',
            items: { type: 'string' },
            description: 'Required artifacts that do not exist yet; present only when apply is blocked.',
          },
          warnings: {
            type: 'array',
            items: { type: 'string' },
            description: 'Warnings about tracking evidence or apply state.',
          },
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const change = requireChange(args)
      const cwd = await sessionCwd(ctx, exec)
      const entry = await loadApplyState(
        ctx,
        settings,
        cwd,
        change,
        optionalStore(args),
        exec.signal,
      )
      return projectApply(entry)
    },
  }))
}

/**
 * Register `openspec_mark_task_done`.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
export function registerMarkTaskDoneTool(ctx, settings) {
  ctx.effect(() => ctx.tools.register({
    name: 'openspec_mark_task_done',
    description: 'Mark one or more tasks complete in the change tracking file and return one result per task plus updated progress and the next pending task. Pass every task finished since the last call in taskIds; do not edit tasks.md by hand and do not re-run openspec_apply_next between calls. A batch is written only when every id is found, so one wrong id changes nothing. The change must use the built-in spec-driven schema.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['change', 'taskIds'],
      properties: {
        change: {
          type: 'string',
          description: 'Change name, exactly as the list action reports it.',
        },
        taskIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Task ids to mark done in this call, in the order they were finished: numeric ids such as 2.3, or #N for a task without a numeric prefix. A single task is a one-element array; duplicates are ignored.',
        },
        sourcePath: {
          type: 'string',
          description: 'Optional exact file returned by openspec_apply_next for one of the ids, relative to root.path; it pins that task to its line before writing.',
        },
        line: {
          type: 'number',
          description: 'Optional exact 1-based line returned by openspec_apply_next for the same task; use it with sourcePath.',
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
        required: ['change', 'results', 'state', 'progress'],
        properties: {
          change: { type: 'string' },
          results: {
            type: 'array',
            description: 'One entry per distinct task, in input order.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'status'],
              properties: {
                id: { type: 'string', description: 'The task id this entry answers.' },
                status: {
                  type: 'string',
                  enum: ['flipped', 'already-done'],
                  description: 'flipped means this call changed the checkbox; already-done means it was already complete.',
                },
              },
            },
          },
          state: MARK_STATE_SCHEMA,
          progress: PROGRESS_SCHEMA,
          next: NEXT_SCHEMA,
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const change = requireChange(args)
      const taskIds = requireTaskIds(args)
      const store = optionalStore(args)
      const hint = {
        sourcePath: optionalSourcePath(args),
        line: optionalLine(args),
      }
      const cwd = await sessionCwd(ctx, exec)
      let entry = await ensureEntry(ctx, settings, cwd, change, store, exec.signal)
      let resolved = resolveMarks(entry, taskIds, {
        ...hint,
        sourcePath: resolveSourcePath(hint.sourcePath, entry.projectRoot),
      })
      if (resolved.missing.length > 0) {
        // The cache was fresh, so a miss is either a wrong id or a file that
        // changed without the fingerprint noticing (a new file, for example).
        // Refresh once before declaring any id unknown.
        entry = await loadApplyState(ctx, settings, cwd, change, store, exec.signal)
        resolved = resolveMarks(entry, taskIds, {
          ...hint,
          sourcePath: resolveSourcePath(hint.sourcePath, entry.projectRoot),
        })
      }
      if (resolved.missing.length > 0) {
        throw taskNotFound(
          change,
          resolved.missing,
          entry,
          entry.payload.state === 'blocked',
          taskIds.length > 1,
        )
      }
      const committed = commitMarks(entry, resolved.plans)
      if (committed.interrupted !== undefined) {
        throw markInterrupted(change, committed.interrupted, committed.results)
      }
      return projectMark(entry, committed)
    },
  }))
}

/**
 * Resolve a relative source path against the cached project root.
 * @param value - caller's path, or undefined.
 * @param root - cached project root.
 * @returns an absolute path when possible, otherwise the input.
 */
function resolveSourcePath(value, root) {
  if (typeof value !== 'string' || value === '' || isAbsolute(value) || root === '') return value
  return resolve(root, value)
}
