/**
 * Shared schemas and helpers for the agent tools.
 *
 * @module dsh-openspec-flow/tools/shared
 */

import { runOpenSpec, throwIfOnlyStatus, withStore } from '../openspec.js'
import { assertBuiltinSchema, projectRootFromStatus } from '../schema.js'
import { taskKey } from '../tasks.js'

/** Progress object shared by apply and mark output. */
export const PROGRESS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['total', 'complete', 'remaining'],
  properties: {
    total: {
      type: 'number',
      description: 'Checkbox lines in the tracking files, including text-less checkboxes.',
    },
    complete: { type: 'number', description: 'Checkbox lines marked done.' },
    remaining: { type: 'number', description: 'Checkbox lines still open.' },
  },
}

/** One pending task, located exactly in its tracking file. */
export const NEXT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'description', 'sourcePath', 'line'],
  properties: {
    id: {
      type: 'string',
      description: 'Numeric id such as 2.3, or #N for a task without a numeric prefix. Pass it to openspec_mark_task_done.',
    },
    description: {
      type: 'string',
      description: 'Task text after the checkbox, including its numeric prefix.',
    },
    sourcePath: {
      type: 'string',
      description: 'Absolute path of the tracking file.',
    },
    line: {
      type: 'number',
      description: '1-based line of the task checkbox.',
    },
    descriptionTruncated: {
      type: 'boolean',
      description: 'True when the description was cut at 1000 characters; read sourcePath at line for the full text.',
    },
  },
}

/** Artifact id to concrete file paths. */
export const CONTEXT_FILES_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  description: 'Artifact id to absolute file paths. Read every listed file before editing.',
}

/** The resolved OpenSpec root. */
export const ROOT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'source'],
  properties: {
    path: { type: 'string' },
    source: { type: 'string' },
  },
}

/** A stored CLI instruction that tells the model what to do next. */
export const INSTRUCTION_SCHEMA = {
  type: 'string',
  description: 'The instruction for the current state.',
}

/** Apply states the CLI uses. */
export const APPLY_STATE_SCHEMA = {
  type: 'string',
  enum: ['ready', 'blocked', 'all_done'],
  description: 'ready means work is available; blocked means a prerequisite or tracking file is missing; all_done means every tracked task is complete.',
}

/** States reachable after one task is marked done. */
export const MARK_STATE_SCHEMA = {
  type: 'string',
  enum: ['ready', 'all_done'],
  description: 'ready means more tasks remain; all_done means the tracking files are complete.',
}

/**
 * Resolve the session's working directory.
 * @param ctx - host context.
 * @param exec - tool execution context.
 * @returns an absolute directory path.
 */
export async function sessionCwd(ctx, exec) {
  if (exec.agent !== undefined) {
    return await ctx.workingDirectory.ensure(exec.agent, exec.signal)
  }
  const fallback = ctx.workingDirectory.defaultDirectory
  if (typeof fallback === 'string' && fallback !== '') return fallback
  throw new Error('openspec-flow: no working directory is available for this session.')
}

/**
 * Read a change's schema and reject it unless it is the built-in copy.
 *
 * Used by tools whose CLI payload does not carry `schemaName`; `status` and
 * `instructions apply` call `assertBuiltinSchema` on their own payload instead
 * of paying for a second CLI call.
 *
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param change - change name.
 * @param store - optional store id.
 * @param signal - cancellation.
 * @returns nothing when the change uses the built-in schema.
 */
export async function assertSupportedChangeSchema(ctx, settings, cwd, change, store, signal) {
  const { json } = await runOpenSpec(
    ctx,
    settings,
    cwd,
    withStore(['status', '--change', change, '--json'], store),
    signal,
  )
  throwIfOnlyStatus(json, ['changeName'])
  assertBuiltinSchema(json.schemaName, projectRootFromStatus(json), change)
}

/**
 * Validate and trim the required change parameter.
 * @param args - tool arguments.
 * @returns the change name.
 */
export function requireChange(args) {
  const value = args?.change
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('A non-empty change name is required.')
  }
  return value.trim()
}

/**
 * Validate and trim the required task id parameter.
 * @param args - tool arguments.
 * @returns the task id.
 */
export function requireTaskId(args) {
  const value = args?.taskId
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('A task id is required: the id returned by openspec_apply_next, such as 2.3 or #7.')
  }
  return value.trim()
}

/**
 * Read the optional store id.
 * @param args - tool arguments.
 * @returns the store id, or undefined.
 */
export function optionalStore(args) {
  const value = args?.store
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Read the optional source path hint.
 * @param args - tool arguments.
 * @returns the path, or undefined.
 */
export function optionalSourcePath(args) {
  const value = args?.sourcePath
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('sourcePath must be a non-empty string when supplied.')
  }
  return value
}

/**
 * Read the optional line hint.
 * @param args - tool arguments.
 * @returns the line, or undefined.
 */
export function optionalLine(args) {
  const value = args?.line
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('line must be a positive integer when supplied.')
  }
  return value
}

/**
 * Compact JSON rendering for the model; whitespace is bytes.
 * @param _args - tool arguments.
 * @param value - tool output value.
 * @returns one text block.
 */
export function renderJson(_args, value) {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

/**
 * Format a not-found mark failure with bounded, actionable context.
 * @param change - change name.
 * @param taskId - caller's id.
 * @param entry - cached apply state.
 * @param blocked - whether apply is blocked.
 * @returns an Error.
 */
export function taskNotFound(change, taskId, entry, blocked) {
  const pending = entry.tasks
    .filter((task) => !task.done)
    .slice(0, 12)
    .map((task) => `${taskKey(task)} (line ${task.line})`)
  const suffix = blocked && typeof entry.payload.instruction === 'string'
    ? `\nApply is blocked: ${entry.payload.instruction}`
    : ''
  const available = pending.length > 0
    ? `\nPending tasks: ${pending.join(', ')}`
    : '\nThere are no pending tasks with text.'
  return new Error(
    `Task '${taskId}' was not found in change '${change}'.${available}${suffix}\nRun openspec_apply_next to refresh the task list.`,
  )
}
