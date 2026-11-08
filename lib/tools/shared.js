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
      description: 'Numeric id such as 2.3, or #N for a task without a numeric prefix. Pass it in taskIds to openspec_mark_task_done.',
    },
    description: {
      type: 'string',
      description: 'Task text after the checkbox, including its numeric prefix.',
    },
    sourcePath: {
      type: 'string',
      description: 'Path of the tracking file, relative to the resolved project root; openspec_apply_next returns that root as root.path.',
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
  description: 'Artifact id to file paths relative to the project root (root.path). Read every listed file before editing.',
}

/** The resolved OpenSpec root. */
export const ROOT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'source'],
  properties: {
    path: {
      type: 'string',
      description: 'Absolute path of the resolved project root; the base for every other path.',
    },
    source: { type: 'string' },
    store_id: {
      type: 'string',
      description: 'Registered store id when the resolved root is store-selected.',
    },
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

/** States reachable after a mark call. */
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
 * Validate and trim the required task id list.
 * @param args - tool arguments.
 * @returns distinct task ids in caller order.
 */
export function requireTaskIds(args) {
  const value = args?.taskIds
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('taskIds must be a non-empty array of task ids, such as ["2.3"] or ["1.1", "1.2"].')
  }
  const ids = []
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      throw new Error('Every taskIds entry must be a non-empty task id such as 2.3 or #7.')
    }
    ids.push(entry.trim())
  }
  return [...new Set(ids)]
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
 * @param taskIds - the ids that did not resolve.
 * @param entry - cached apply state.
 * @param blocked - whether apply is blocked.
 * @param batch - whether the call carried more than one id.
 * @returns an Error.
 */
export function taskNotFound(change, taskIds, entry, blocked, batch = false) {
  const ids = taskIds
  const subject = ids.length === 1
    ? `Task '${ids[0]}' was not found in change '${change}'.`
    : `Tasks ${ids.map((id) => `'${id}'`).join(', ')} were not found in change '${change}'.`
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
  const untouched = batch
    ? '\nNo task was marked because a batch writes only when every id is found.'
    : ''
  return new Error(
    `${subject}${available}${untouched}${suffix}\nRun openspec_apply_next to refresh the task list.`,
  )
}

/**
 * Format a stop raised when a planned line disappears during a batch write.
 * @param change - change name.
 * @param interrupted - the task id that could not be marked.
 * @param results - result entries produced before the stop.
 * @returns an Error.
 */
export function markInterrupted(change, interrupted, results) {
  const flipped = results
    .filter((item) => item.status === 'flipped')
    .map((item) => item.id)
  const marked = flipped.length > 0
    ? ` Marked before stopping: ${flipped.join(', ')}.`
    : ' No task was marked.'
  return new Error(
    `Task '${interrupted}' changed while the batch was being marked in change '${change}'.${marked}\nRun openspec_apply_next to resync the task list.`,
  )
}
