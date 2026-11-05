/**
 * Apply-loop tools: start/resume apply and mark one task done.
 *
 * @module dsh-openspec-flow/tools/apply
 */

import { ensureEntry, loadApplyState, projectApply, projectMark, markDone } from '../state.js'
import {
  APPLY_STATE_SCHEMA,
  CONTEXT_FILES_SCHEMA,
  INSTRUCTION_SCHEMA,
  MARK_STATE_SCHEMA,
  NEXT_SCHEMA,
  PROGRESS_SCHEMA,
  optionalLine,
  optionalSourcePath,
  optionalStore,
  renderJson,
  requireChange,
  requireTaskId,
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
    description: 'Start or resume OpenSpec apply in one compact call: state, progress, the next pending task with its exact file and line, context files, and the CLI instruction. Call it once per apply session; after each task use openspec_mark_task_done instead of calling this again. Only the CLI\'s built-in spec-driven schema is supported; custom or shadowed schemas are rejected.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['change'],
      properties: {
        change: {
          type: 'string',
          description: 'Change name, exactly as openspec_list reports it.',
        },
        store: {
          type: 'string',
          description: 'Registered store id; pass it on every call when the user works in a store.',
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
          missingArtifacts: {
            type: 'array',
            items: { type: 'string' },
            description: 'Required artifacts that do not exist yet; present only when apply is blocked.',
          },
          warnings: {
            type: 'array',
            items: { type: 'string' },
            description: 'CLI warnings about tracking evidence or apply state.',
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
    description: 'Mark one task complete in the change tracking file and return updated progress plus the next pending task. Use it after finishing each task; do not edit tasks.md by hand and do not re-run openspec_apply_next between tasks. The change must use the built-in spec-driven schema.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['change', 'taskId'],
      properties: {
        change: {
          type: 'string',
          description: 'Change name, exactly as openspec_list reports it.',
        },
        taskId: {
          type: 'string',
          description: 'Task id returned by openspec_apply_next: a numeric id such as 2.3, or #N for a task without a numeric prefix.',
        },
        sourcePath: {
          type: 'string',
          description: 'Optional exact file returned by openspec_apply_next; when supplied it is verified before writing.',
        },
        line: {
          type: 'number',
          description: 'Optional exact 1-based line returned by openspec_apply_next; verify it together with sourcePath.',
        },
        store: {
          type: 'string',
          description: 'Registered store id; pass it on every call when the user works in a store.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['change', 'taskId', 'status', 'state', 'progress'],
        properties: {
          change: { type: 'string' },
          taskId: { type: 'string', description: 'The id this call marked or found already done.' },
          status: {
            type: 'string',
            enum: ['flipped', 'already-done'],
            description: 'flipped means this call changed the checkbox; already-done means it was already complete.',
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
      const taskId = requireTaskId(args)
      const store = optionalStore(args)
      const hint = {
        sourcePath: optionalSourcePath(args),
        line: optionalLine(args),
      }
      const cwd = await sessionCwd(ctx, exec)
      let entry = await ensureEntry(ctx, settings, cwd, change, store, exec.signal)
      let result = markDone(entry, taskId, hint)
      if (!result.found) {
        // The cache was fresh, so a miss is either a wrong id or a file that
        // changed without the fingerprint noticing (a new file, for example).
        // Refresh once before declaring the id unknown.
        entry = await loadApplyState(ctx, settings, cwd, change, store, exec.signal)
        result = markDone(entry, taskId, { sourcePath: hint.sourcePath })
      }
      if (!result.found) {
        throw taskNotFound(change, taskId, entry, entry.payload.state === 'blocked')
      }
      return projectMark(entry, result, taskId)
    },
  }))
}
