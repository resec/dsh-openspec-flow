/**
 * The five agent tools.
 *
 * Each tool resolves the calling Session's working directory, runs the OpenSpec
 * CLI through the Host subprocess service, and returns a bounded projection of
 * its JSON. `openspec_apply_next` caches the full payload; the later
 * `openspec_mark_task_done` calls use that cache instead of re-running
 * `instructions apply`.
 *
 * @module dsh-openspec-flow/tools
 */

import { errorFromStatus, runOpenSpec, throwIfOnlyStatus, withStore } from './openspec.js'
import { assertBuiltinSchema, projectRootFromStatus } from './schema.js'
import {
  ensureEntry,
  loadApplyState,
  markDone,
  projectApply,
  projectList,
  projectMark,
  projectStatus,
  projectValidate,
} from './state.js'
import { taskKey } from './tasks.js'

/** Progress object shared by apply and mark output. */
const PROGRESS_SCHEMA = {
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
const NEXT_SCHEMA = {
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
const CONTEXT_FILES_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  description: 'Artifact id to absolute file paths. Read every listed file before editing.',
}

/** The resolved OpenSpec root. */
const ROOT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'source'],
  properties: {
    path: { type: 'string' },
    source: { type: 'string' },
  },
}

/** A stored CLI instruction that tells the model what to do next. */
const INSTRUCTION_SCHEMA = {
  type: 'string',
  description: 'The CLI\'s instruction for the current state.',
}

/** Apply states the CLI uses. */
const APPLY_STATE_SCHEMA = {
  type: 'string',
  enum: ['ready', 'blocked', 'all_done'],
  description: 'ready means work is available; blocked means a prerequisite or tracking file is missing; all_done means every tracked task is complete.',
}

/** States reachable after one task is marked done. */
const MARK_STATE_SCHEMA = {
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
async function sessionCwd(ctx, exec) {
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
async function assertSupportedChangeSchema(ctx, settings, cwd, change, store, signal) {
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
function requireChange(args) {
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
function requireTaskId(args) {
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
function optionalStore(args) {
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
function optionalSourcePath(args) {
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
function optionalLine(args) {
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
function renderJson(_args, value) {
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
function taskNotFound(change, taskId, entry, blocked) {
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

/**
 * Register the five tools on the plugin's context.
 * @param ctx - host context carrying tools, subprocess and workingDirectory.
 * @param settings - resolved plugin settings.
 * @returns nothing; every registration is owned by the plugin's effect scope.
 */
export function registerTools(ctx, settings) {
  ctx.effect(() => ctx.tools.register({
    name: 'openspec_list',
    description: 'List OpenSpec changes in the current project with task counts. Use it to choose a change before status or apply. Returns setup:false when the current directory is not inside an OpenSpec project; this tool never creates one.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        store: {
          type: 'string',
          description: 'Registered store id; pass it when the user works in a store rather than the nearest local openspec/ root.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['setup', 'changes'],
        properties: {
          setup: {
            type: 'boolean',
            description: 'True when an OpenSpec root was found; false means the current directory is not inside an OpenSpec project.',
          },
          root: ROOT_SCHEMA,
          changes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'completedTasks', 'totalTasks', 'status'],
              properties: {
                name: { type: 'string' },
                completedTasks: { type: 'number' },
                totalTasks: { type: 'number' },
                status: { type: 'string' },
              },
            },
          },
          issue: {
            type: 'string',
            description: 'Why setup is false, when the CLI reported a reason.',
          },
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const cwd = await sessionCwd(ctx, exec)
      const { json } = await runOpenSpec(
        ctx,
        settings,
        cwd,
        withStore(['list', '--json'], optionalStore(args)),
        exec.signal,
      )
      if (json === null || typeof json !== 'object' || Array.isArray(json)) {
        throw new Error('openspec list returned a non-object payload.')
      }
      if (json.changes === undefined && Array.isArray(json.status)) {
        throw errorFromStatus(json.status)
      }
      if (!Array.isArray(json.changes)) {
        throw new Error('openspec list returned no changes array.')
      }
      return projectList(json)
    },
  }))

  ctx.effect(() => ctx.tools.register({
    name: 'openspec_status',
    description: 'Inspect one OpenSpec change: schema, artifact completion, next steps, and edit constraints. Use it before writing planning artifacts or before starting apply. Only the CLI\'s built-in spec-driven schema is supported; custom or shadowed schemas are rejected.',
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
          description: 'Registered store id; pass it when the user works in a store.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: [
          'change',
          'schema',
          'changeRoot',
          'isPlanningComplete',
          'isComplete',
          'applyRequires',
          'artifacts',
        ],
        properties: {
          change: { type: 'string' },
          schema: { type: 'string' },
          changeRoot: { type: 'string' },
          planningHome: { type: 'string', description: 'Root of the planning home.' },
          isPlanningComplete: { type: 'boolean' },
          isComplete: { type: 'boolean' },
          applyRequires: { type: 'array', items: { type: 'string' } },
          artifacts: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'status', 'requires'],
              properties: {
                id: { type: 'string' },
                status: { type: 'string' },
                requires: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          nextSteps: { type: 'array', items: { type: 'string' } },
          actionContext: {
            type: 'object',
            additionalProperties: false,
            properties: {
              mode: { type: 'string' },
              sourceOfTruth: { type: 'string' },
              allowedEditRoots: { type: 'array', items: { type: 'string' } },
              requiresAffectedAreaSelection: { type: 'boolean' },
              constraints: { type: 'array', items: { type: 'string' } },
            },
          },
          root: ROOT_SCHEMA,
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const change = requireChange(args)
      const cwd = await sessionCwd(ctx, exec)
      const { json } = await runOpenSpec(
        ctx,
        settings,
        cwd,
        withStore(['status', '--change', change, '--json'], optionalStore(args)),
        exec.signal,
      )
      throwIfOnlyStatus(json, ['changeName'])
      assertBuiltinSchema(json.schemaName, projectRootFromStatus(json), change)
      return projectStatus(json)
    },
  }))

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

  ctx.effect(() => ctx.tools.register({
    name: 'openspec_validate',
    description: 'Validate one OpenSpec change and return compact findings. Use it after the last task and before archiving. Only the CLI\'s built-in spec-driven schema is supported; custom or shadowed schemas are rejected.',
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
          description: 'Registered store id; pass it when the user works in a store.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['change', 'valid', 'issues'],
        properties: {
          change: { type: 'string' },
          valid: { type: 'boolean' },
          issues: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['level', 'path', 'message'],
              properties: {
                level: { type: 'string', description: 'ERROR, WARNING, or INFO.' },
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
      await assertSupportedChangeSchema(ctx, settings, cwd, change, store, exec.signal)
      const { json } = await runOpenSpec(
        ctx,
        settings,
        cwd,
        withStore(['validate', change, '--json'], store),
        exec.signal,
      )
      throwIfOnlyStatus(json, ['items'])
      return projectValidate(json, change)
    },
  }))
}
