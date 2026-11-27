/**
 * Read-only tools: the inspect entry and the management queries.
 *
 * @module dsh-openspec-flow/tools/query
 */

import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import { errorFromStatus, runOpenSpec, throwIfOnlyStatus, withStore } from '../openspec.js'
import { adminToolsVisible } from '../admin.js'
import { gitCommonDir } from '../review/store.js'
import { assertBuiltinSchema, projectRootFromStatus } from '../schema.js'
import { inspectApplyLocks, isDeadLock } from '../worktree/lock.js'
import { applyStatePath, applyWorktreeFor, mainWorktreeRoot, readApplyState } from '../worktree/state.js'
import {
  projectContext,
  projectInstructions,
  projectList,
  projectShow,
  projectSpecList,
  projectStatus,
  projectStoreList,
  projectSupportedSchemas,
  projectValidate,
  projectValidationReport,
} from '../state.js'
import {
  ROOT_SCHEMA,
  assertSupportedChangeSchema,
  optionalStore,
  renderJson,
  requireChange,
  sessionCwd,
} from './shared.js'

/**
 * Define the `list` action.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
function defineListTool(ctx, settings) {
  return {
    name: 'openspec_inspect:list',
    description: 'List OpenSpec changes in the current project with task counts. Use it to choose a change before status or apply. Returns setup:false when the current directory is not inside an OpenSpec project; this tool never creates one.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        specs: {
          type: 'boolean',
          description: 'List capability specs instead of active changes, to inventory what the project already covers.',
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
        required: ['setup'],
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
          specs: {
            type: 'array',
            description: 'Present when specs is true.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'requirementCount'],
              properties: {
                id: { type: 'string' },
                requirementCount: { type: 'number' },
              },
            },
          },
          issue: {
            type: 'string',
            description: 'Why setup is false, when a reason was reported.',
          },
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const sessionDir = await sessionCwd(ctx, exec)
      const cwd = readCwd(sessionDir)
      const specsMode = args?.specs === true
      const { json } = await runOpenSpec(
        ctx,
        settings,
        cwd,
        withStore(specsMode ? ['list', '--specs', '--json'] : ['list', '--json'], optionalStore(args)),
        exec.signal,
      )
      return specsMode ? projectSpecListPayload(json) : projectListPayload(json)
    },
  }
}

/**
 * Define the `status` action.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
function defineStatusTool(ctx, settings) {
  return {
    name: 'openspec_inspect:status',
    description: 'Inspect one OpenSpec change: schema, artifact completion, blockedBy, next steps as tool actions, and edit constraints. Use it before writing planning artifacts or before starting apply. Only the built-in spec-driven schema is supported; custom or shadowed schemas are rejected.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['change'],
      properties: {
        change: {
          type: 'string',
          description: 'Change name.',
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
          changeRoot: { type: 'string', description: 'Change directory relative to root.path.' },
          planningHome: { type: 'string', description: 'Planning home relative to root.path; absolute when outside it.' },
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
          blockedBy: {
            type: 'array',
            items: { type: 'string' },
            description: 'Artifact ids that are ready to write and still missing, in build order; present only while planning is incomplete. The first id is the next artifact to write.',
          },
          nextSteps: {
            type: 'array',
            description: 'Tool calls that unblock planning or start apply; each names a tool and its arguments.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['tool', 'arguments'],
              properties: {
                tool: {
                  type: 'string',
                  enum: ['openspec_inspect', 'openspec_apply_next'],
                },
                arguments: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    action: { type: 'string', enum: ['instructions'] },
                    change: { type: 'string' },
                    artifact: { type: 'string' },
                    store: { type: 'string' },
                  },
                },
              },
            },
          },
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
      const sessionDir = await sessionCwd(ctx, exec)
      const cwd = readCwd(sessionDir)
      const { json } = await runOpenSpec(
        ctx,
        settings,
        cwd,
        withStore(['status', '--change', change, '--json'], optionalStore(args)),
        exec.signal,
      )
      throwIfOnlyStatus(json, ['changeName'])
      assertBuiltinSchema(json.schemaName, projectRootFromStatus(json), change)
      return projectStatus(json, { store: optionalStore(args) })
    },
  }
}

/**
 * Define the `instructions` action.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
function defineInstructionsTool(ctx, settings) {
  return {
    name: 'openspec_inspect:instructions',
    description: 'Read the instruction for a planning artifact (proposal, specs, design, tasks) or the archive operation inputs. Artifact results carry the instruction, output path, dependencies and unlocks, plus the project context and rules when configured; the archive result carries the project context and archive guidance when configured. Use it before writing or revising an artifact or before archiving. Only the built-in spec-driven schema is supported; custom or shadowed schemas are rejected.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['change', 'artifact'],
      properties: {
        change: {
          type: 'string',
          description: 'Change name.',
        },
        artifact: {
          type: 'string',
          enum: ['proposal', 'specs', 'design', 'tasks', 'archive'],
          description: 'Planning artifact to read, or archive for the archive operation inputs.',
        },
        store: {
          type: 'string',
          description: 'Registered store id.',
        },
      },
    },
    output: {
      schema: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['change', 'artifact', 'schema', 'outputPath', 'instruction', 'dependencies', 'unlocks'],
            properties: {
              change: { type: 'string' },
              artifact: { type: 'string', enum: ['proposal', 'specs', 'design', 'tasks'] },
              schema: { type: 'string' },
              outputPath: { type: 'string', description: 'Artifact file path relative to the change directory.' },
              resolvedOutputPath: { type: 'string', description: 'Artifact file path relative to root.path.' },
              existingOutputPaths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Existing artifact files relative to root.path.',
              },
              description: { type: 'string' },
              instruction: { type: 'string' },
              context: {
                type: 'string',
                description: 'Project context from openspec/config.yaml when configured; it applies to every artifact.',
              },
              rules: {
                type: 'array',
                items: { type: 'string' },
                description: 'Rules for this artifact from openspec/config.yaml when configured.',
              },
              dependencies: { type: 'array', items: { type: 'string' } },
              unlocks: { type: 'array', items: { type: 'string' } },
              root: ROOT_SCHEMA,
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['change', 'artifact'],
            properties: {
              change: { type: 'string' },
              artifact: { type: 'string', enum: ['archive'] },
              context: {
                type: 'string',
                description: 'Project context from openspec/config.yaml when configured; it applies to the archive operation.',
              },
              guidance: {
                type: 'array',
                items: { type: 'string' },
                description: 'Archive guidance from openspec/config.yaml when configured.',
              },
              root: ROOT_SCHEMA,
            },
          },
        ],
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const change = requireChange(args)
      const artifact = requireArtifact(args)
      const sessionDir = await sessionCwd(ctx, exec)
      const cwd = readCwd(sessionDir)
      const { json } = await runOpenSpec(
        ctx,
        settings,
        cwd,
        withStore(['instructions', artifact, '--change', change, '--json'], optionalStore(args)),
        exec.signal,
      )
      throwIfOnlyStatus(json, ['changeName'])
      if (typeof json.schemaName === 'string' && json.schemaName !== '') {
        assertBuiltinSchema(json.schemaName, projectRootFromStatus(json), change)
      } else {
        await assertSupportedChangeSchema(ctx, settings, cwd, change, optionalStore(args), exec.signal)
      }
      return projectInstructions(json, artifact)
    },
  }
}

/**
 * Validate the requested artifact id.
 * @param args - tool arguments.
 * @returns the artifact id.
 */
function requireArtifact(args) {
  const value = args?.artifact
  if (value === 'proposal' || value === 'specs' || value === 'design' || value === 'tasks' || value === 'archive') {
    return value
  }
  throw new Error('artifact must be one of proposal, specs, design, tasks or archive.')
}

/**
 * Define the `show` action.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
function defineShowTool(ctx, settings) {
  return {
    name: 'openspec_inspect:show',
    description: 'Read one OpenSpec change or spec. A change returns its delta requirements; a spec returns its purpose, requirements and scenarios. Use noScenarios to skip scenario text, and type when a change and a spec share a name.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          description: 'Change or spec id, exactly as the list action reports it.',
        },
        type: {
          type: 'string',
          enum: ['change', 'spec'],
          description: 'Disambiguates an id shared by a change and a spec.',
        },
        noScenarios: {
          type: 'boolean',
          description: 'Skip scenario text and return requirement lines only.',
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
        required: ['kind', 'name', 'title'],
        properties: {
          kind: { type: 'string', enum: ['change', 'spec'] },
          name: { type: 'string' },
          title: { type: 'string' },
          overview: { type: 'string' },
          requirementCount: { type: 'number' },
          requirements: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'text', 'scenarios'],
              properties: {
                name: { type: 'string' },
                text: { type: 'string' },
                scenarios: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['name'],
                    properties: {
                      name: { type: 'string' },
                      rawText: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          deltaCount: { type: 'number' },
          deltas: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['spec', 'operation', 'requirements'],
              properties: {
                spec: { type: 'string' },
                operation: { type: 'string' },
                requirements: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['name', 'text', 'scenarios'],
                    properties: {
                      name: { type: 'string' },
                      text: { type: 'string' },
                      scenarios: {
                        type: 'array',
                        items: {
                          type: 'object',
                          additionalProperties: false,
                          required: ['name'],
                          properties: {
                            name: { type: 'string' },
                            rawText: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          root: ROOT_SCHEMA,
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const name = requireItemName(args)
      const type = optionalShowType(args)
      const sessionDir = await sessionCwd(ctx, exec)
      const cwd = readCwd(sessionDir)
      const command = ['show', name, '--json']
      if (type !== undefined) command.push('--type', type)
      if (args?.noScenarios === true) command.push('--no-scenarios')
      const { json } = await runOpenSpec(ctx, settings, cwd, withStore(command, optionalStore(args)), exec.signal)
      throwIfOnlyStatus(json, ['title'])
      return projectShow(json)
    },
  }
}

/**
 * Validate the required item name.
 * @param args - tool arguments.
 * @returns the item name.
 */
function requireItemName(args) {
  const value = args?.name
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('A non-empty item name is required.')
  }
  return value.trim()
}

/**
 * Read the optional show type.
 * @param args - tool arguments.
 * @returns change, spec, or undefined.
 */
function optionalShowType(args) {
  const value = args?.type
  if (value === undefined || value === null) return undefined
  if (value === 'change' || value === 'spec') return value
  throw new Error('type must be change or spec when supplied.')
}

/** A diagnostic reported for a context root or a referenced store. */
const CONTEXT_DIAGNOSTIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['message'],
  properties: {
    severity: { type: 'string', description: 'warning or error when reported.' },
    code: { type: 'string', description: 'Stable diagnostic code when reported.' },
    message: { type: 'string', description: 'Human-readable diagnostic.' },
    fix: { type: 'string', description: 'Action that resolves the diagnostic.' },
  },
}

/** The tool action that reads a spec from a referenced store. */
const CONTEXT_FETCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tool', 'arguments'],
  properties: {
    tool: { type: 'string', enum: ['openspec_inspect'] },
    arguments: {
      type: 'object',
      additionalProperties: false,
      required: ['action', 'type', 'store'],
      properties: {
        action: { type: 'string', enum: ['show'] },
        type: { type: 'string', enum: ['spec'] },
        store: { type: 'string', description: 'Referenced store id.' },
      },
    },
    note: { type: 'string', description: 'The argument the action still needs.' },
  },
}

/** A store referenced by the resolved root. */
const CONTEXT_MEMBER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'status'],
  properties: {
    role: { type: 'string', description: 'Member role reported for the working set.' },
    id: { type: 'string', description: 'Referenced store id.' },
    path: {
      type: 'string',
      description: 'Absolute root of the referenced store; absent when it is not available on this machine.',
    },
    fetch: CONTEXT_FETCH_SCHEMA,
    status: { type: 'array', items: CONTEXT_DIAGNOSTIC_SCHEMA },
  },
}

/**
 * Define the `context` action.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
function defineContextTool(ctx, settings) {
  return {
    name: 'openspec_inspect:context',
    description: 'Read the working context for the resolved OpenSpec root: the root with its store id when store-selected, referenced stores, and diagnostics. Use it to discover the root or confirm setup before proposing. An available referenced store carries a fetch action naming openspec_inspect and the argument it still needs.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
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
        required: ['setup', 'members', 'status'],
        properties: {
          setup: {
            type: 'boolean',
            description: 'True when an OpenSpec root was resolved.',
          },
          root: ROOT_SCHEMA,
          members: {
            type: 'array',
            items: CONTEXT_MEMBER_SCHEMA,
            description: 'Referenced stores declared by the project, with availability and diagnostics.',
          },
          status: {
            type: 'array',
            items: CONTEXT_DIAGNOSTIC_SCHEMA,
            description: 'Diagnostics reported for the resolved root.',
          },
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const sessionDir = await sessionCwd(ctx, exec)
      const cwd = readCwd(sessionDir)
      const { json } = await runOpenSpec(
        ctx,
        settings,
        cwd,
        withStore(['context', '--json'], optionalStore(args)),
        exec.signal,
      )
      if (json === null || typeof json !== 'object' || Array.isArray(json)) {
        throw new Error('openspec context returned a non-object payload.')
      }
      return projectContext(json)
    },
  }
}

/**
 * Register `openspec_schemas`.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
export function registerSchemasTool(ctx, settings) {
  ctx.effect(() => ctx.tools.register({
    name: 'openspec_schemas',
    description: 'List the workflow schemas this plugin supports, with their source and artifacts. Only the built-in spec-driven schema from the package is returned; custom and shadowed schemas are omitted.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
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
        required: ['schemas'],
        properties: {
          schemas: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'description', 'artifacts', 'source'],
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                artifacts: { type: 'array', items: { type: 'string' } },
                source: { type: 'string', description: 'package for the supported built-in schema.' },
              },
            },
          },
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const sessionDir = await sessionCwd(ctx, exec)
      const cwd = readCwd(sessionDir)
      const { json } = await runOpenSpec(
        ctx,
        settings,
        cwd,
        withStore(['schemas', '--json'], optionalStore(args)),
        exec.signal,
      )
      if (!Array.isArray(json)) {
        if (json !== null && typeof json === 'object' && Array.isArray(json.status)) {
          throw errorFromStatus(json.status)
        }
        throw new Error('openspec schemas returned a non-array payload.')
      }
      return projectSupportedSchemas(json)
    },
  }, { when: ({ agent }) => adminToolsVisible(agent) }))
}

/**
 * Register `openspec_store_list`.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
export function registerStoreListTool(ctx, settings) {
  ctx.effect(() => ctx.tools.register({
    name: 'openspec_store_list',
    description: 'List registered OpenSpec stores with their ids and roots.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['stores', 'status'],
        properties: {
          stores: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'root'],
              properties: {
                id: { type: 'string' },
                root: { type: 'string' },
                metadataPath: { type: 'string' },
              },
            },
          },
          status: { type: 'array', items: { type: 'string' } },
        },
      },
      render: renderJson,
    },
    async execute(_args, exec) {
      const sessionDir = await sessionCwd(ctx, exec)
      const cwd = readCwd(sessionDir)
      const { json } = await runOpenSpec(ctx, settings, cwd, ['store', 'list', '--json'], exec.signal)
      if (json === null || typeof json !== 'object' || Array.isArray(json)) {
        throw new Error('openspec store list returned a non-object payload.')
      }
      return projectStoreList(json)
    },
  }, { when: ({ agent }) => adminToolsVisible(agent) }))
}

/**
 * Define the `validate` action.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
function defineValidateTool(ctx, settings) {
  return {
    name: 'openspec_inspect:validate',
    description: 'Validate one OpenSpec change, one spec, all specs, or everything, and return compact findings. Use it after the last task and before archiving. Change validation supports only the built-in spec-driven schema; custom or shadowed schemas are rejected.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        change: {
          type: 'string',
          description: 'Change name.',
        },
        scope: {
          type: 'string',
          enum: ['change', 'spec', 'specs', 'all'],
          description: 'What to validate. Defaults to change.',
        },
        strict: {
          type: 'boolean',
          description: 'validate: treat warnings as failures.',
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
        required: ['valid'],
        properties: {
          scope: { type: 'string' },
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
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'type', 'valid', 'issues'],
              properties: {
                id: { type: 'string' },
                type: { type: 'string' },
                valid: { type: 'boolean' },
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
              },
            },
          },
          root: ROOT_SCHEMA,
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const scope = normalizeScope(args)
      const strict = args?.strict === true
      const store = optionalStore(args)
      const sessionDir = await sessionCwd(ctx, exec)
      const cwd = readCwd(sessionDir)
      const flags = strict ? ['--strict'] : []

      if (scope === 'change') {
        const change = requireChange(args)
        const routed = applyWorktreeFor(cwd, store, change) ?? cwd
        await assertSupportedChangeSchema(ctx, settings, routed, change, store, exec.signal)
        const { json } = await runOpenSpec(
          ctx,
          settings,
          routed,
          withStore(['validate', change, '--json', ...flags], store),
          exec.signal,
        )
        throwIfOnlyStatus(json, ['items'])
        return projectValidate(json, change)
      }

      const target = scope === 'spec' ? requireChange(args) : undefined
      const command = scope === 'spec'
        ? ['validate', target, '--type', 'spec', '--json', ...flags]
        : scope === 'specs'
          ? ['validate', '--specs', '--json', ...flags]
          : ['validate', '--all', '--json', ...flags]
      const { json } = await runOpenSpec(ctx, settings, cwd, withStore(command, store), exec.signal)
      throwIfOnlyStatus(json, ['items'])
      return projectValidationReport(json, scope)
    },
  }
}

/** Actions `openspec_inspect` accepts. */
const INSPECT_ACTIONS = ['list', 'status', 'show', 'instructions', 'context', 'validate', 'worktree']

/** Parameters each action accepts, beyond `action` and `store`. */
const INSPECT_ACTION_PARAMETERS = {
  list: ['specs'],
  status: ['change'],
  show: ['name', 'type', 'noScenarios'],
  instructions: ['change', 'artifact'],
  context: [],
  validate: ['change', 'scope', 'strict'],
  worktree: ['change'],
}

/** Parameters each action requires before the read starts. */
const INSPECT_REQUIRED_PARAMETERS = {
  list: [],
  status: ['change'],
  show: ['name'],
  instructions: ['change', 'artifact'],
  context: [],
  validate: [],
  worktree: ['change'],
}

/** The action that owns a parameter, used by the misplaced-parameter error. */
const INSPECT_PARAMETER_OWNER = {
  specs: 'list',
  change: 'status, instructions, validate or worktree',
  name: 'show',
  type: 'show',
  noScenarios: 'show',
  artifact: 'instructions',
  scope: 'validate',
  strict: 'validate',
}

/**
 * Define the read-only `worktree` action.
 * @param ctx - host context.
 * @returns the action definition.
 */
function defineWorktreeTool(ctx) {
  return {
    name: 'openspec_inspect:worktree',
    description: 'Inspect one change\'s apply worktree state, lifecycle/change lock owners and the doctor result. Read-only; use openspec_apply_worktree action=recover to recover a dead lock.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        change: {
          type: 'string',
          description: 'Change name.',
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
        required: ['status', 'state', 'locks', 'worktree', 'repair', 'root'],
        properties: {
          status: { type: 'string', enum: ['ready', 'repair-required', 'unavailable'] },
          state: {
            type: 'object',
            additionalProperties: false,
            required: ['exists', 'valid'],
            properties: {
              path: { type: 'string' },
              exists: { type: 'boolean' },
              valid: { type: 'boolean' },
              error: { type: 'string' },
              change: { type: 'string' },
              store: { type: 'string' },
              worktree: { type: 'string' },
              branch: { type: 'string' },
              status: { type: 'string' },
            },
          },
          locks: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['scope', 'path', 'held'],
              properties: {
                scope: { type: 'string' },
                path: { type: 'string' },
                held: { type: 'boolean' },
                state: { type: 'string', enum: ['missing', 'alive', 'dead', 'corrupt'] },
                reason: { type: 'string' },
                owner: { type: 'object', additionalProperties: true },
                alive: { type: 'boolean' },
              },
            },
          },
          worktree: {
            type: 'object',
            additionalProperties: false,
            required: ['exists'],
            properties: {
              path: { type: 'string' },
              exists: { type: 'boolean' },
            },
          },
          repair: {
            type: 'object',
            additionalProperties: false,
            required: ['action'],
            properties: {
              action: { type: 'string', enum: ['none', 'recover', 'cleanup', 'manual'] },
              scope: { type: 'string', enum: ['lifecycle', 'change'] },
              expectedOwner: { type: 'string' },
              message: { type: 'string' },
            },
          },
          root: ROOT_SCHEMA,
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const sessionDir = await sessionCwd(ctx, exec)
      const cwd = readCwd(sessionDir)
      const change = requireChange(args)
      const store = optionalStore(args)
      const root = { path: cwd, source: 'nearest' }
      const common = gitCommonDir(cwd)
      if (common === undefined) {
        return {
          status: 'unavailable',
          state: { exists: false, valid: false },
          locks: [],
          worktree: { exists: false },
          repair: { action: 'manual', message: 'apply worktree state is unavailable outside a git repository' },
          root,
        }
      }
      const path = applyStatePath(cwd, store, change)
      let state
      let stateView = { path, exists: existsSync(path), valid: false }
      try {
        state = readApplyState(cwd, store, change)
        if (state !== undefined) {
          stateView = {
            path,
            exists: true,
            valid: true,
            change: state.change,
            ...(state.store === null ? {} : { store: state.store }),
            worktree: state.worktree,
            branch: state.branch,
            status: state.status,
          }
        }
      } catch (error) {
        stateView = {
          path,
          exists: true,
          valid: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
      const locks = inspectApplyLocks(common, { store, change })
      const corrupt = locks.find((entry) => entry.state === 'corrupt')
      const dead = locks.find((entry) => isDeadLock(entry))
      const worktreePath = state?.worktree
      const worktreeExists = typeof worktreePath === 'string' && existsSync(worktreePath)
      let status = 'ready'
      let repair = { action: 'none' }
      if (corrupt !== undefined) {
        status = 'repair-required'
        repair = { action: 'manual', message: `the ${corrupt.scope} lock at ${corrupt.path} has no usable owner: ${corrupt.reason ?? 'corrupt owner'}` }
      } else if (dead !== undefined) {
        status = 'repair-required'
        repair = {
          action: 'recover',
          scope: dead.scope,
          expectedOwner: dead.owner.token,
        }
      } else if (!stateView.exists) {
        status = 'unavailable'
      } else if (!stateView.valid) {
        status = 'repair-required'
        repair = { action: 'manual', message: stateView.error ?? 'the state file is invalid' }
      } else if (state !== undefined && state.status === 'archived') {
        const cleaned = state.cleanup?.worktreeRemoved === true && state.cleanup?.branchRemoved === true
        const pendingCleanup = !cleaned && (state.cleanup !== undefined || worktreeExists)
        if (pendingCleanup) {
          status = 'repair-required'
          repair = {
            action: 'cleanup',
            message: `the archived worktree cleanup is incomplete: run openspec_apply_worktree action=land change=${change}`,
          }
        } else if (!worktreeExists && state.cleanup === undefined) {
          status = 'repair-required'
          repair = { action: 'manual', message: `the recorded worktree does not exist: ${worktreePath}` }
        }
      } else if (state !== undefined && !worktreeExists) {
        status = 'repair-required'
        repair = { action: 'manual', message: `the recorded worktree does not exist: ${worktreePath}` }
      }
      return {
        status,
        state: stateView,
        locks,
        worktree: {
          ...(typeof worktreePath === 'string' ? { path: worktreePath } : {}),
          exists: worktreeExists,
        },
        repair,
        root,
      }
    },
  }
}

/**
 * Register `openspec_inspect`, the single read entry for the core flow.
 *
 * Each action delegates to the definition of the tool it replaces, so the
 * CLI arguments, schema gates and projections stay identical. The output
 * schema is one `oneOf` over those definitions; `list` and `instructions`
 * contribute their own nested `oneOf` because each has two shapes.
 *
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
export function registerInspectTool(ctx, settings) {
  const definitions = {
    list: defineListTool(ctx, settings),
    status: defineStatusTool(ctx, settings),
    show: defineShowTool(ctx, settings),
    instructions: defineInstructionsTool(ctx, settings),
    context: defineContextTool(ctx, settings),
    validate: defineValidateTool(ctx, settings),
    worktree: defineWorktreeTool(ctx, settings),
  }
  ctx.effect(() => ctx.tools.register({
    name: 'openspec_inspect',
    description: 'Read OpenSpec project or change state. action selects: list changes (specs: true lists capabilities), status one change, show a change delta or a spec, instructions one artifact, context root and members, validate findings, worktree state and locks. Change reads accept only the built-in spec-driven schema.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: INSPECT_ACTIONS,
          description: 'Read to perform: list, status, show, instructions, context, validate or worktree.',
        },
        store: {
          type: 'string',
          description: 'Registered store id.',
        },
        specs: {
          type: 'boolean',
          description: 'list: list capability specs instead of active changes.',
        },
        change: {
          type: 'string',
          description: 'Change name.',
        },
        name: {
          type: 'string',
          description: 'show: change or spec id.',
        },
        type: {
          type: 'string',
          enum: ['change', 'spec'],
          description: 'show: disambiguates an id shared by a change and a spec.',
        },
        noScenarios: {
          type: 'boolean',
          description: 'show: skip scenario text.',
        },
        artifact: {
          type: 'string',
          enum: ['proposal', 'specs', 'design', 'tasks', 'archive'],
          description: 'instructions: artifact to read.',
        },
        scope: {
          type: 'string',
          enum: ['change', 'spec', 'specs', 'all'],
          description: 'validate: what to validate; defaults to change.',
        },
        strict: {
          type: 'boolean',
          description: definitions.validate.parameters.properties.strict.description,
        },
      },
    },
    output: {
      schema: {
        oneOf: Object.values(definitions).map((definition) => definition.output.schema),
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const action = requireInspectAction(args)
      assertInspectArguments(action, args)
      return definitions[action].execute(args, exec)
    },
  }))
}

/**
 * Validate the required inspect action.
 * @param args - tool arguments.
 * @returns the action.
 */
function requireInspectAction(args) {
  const value = args?.action
  if (typeof value === 'string' && INSPECT_ACTIONS.includes(value)) return value
  throw new Error(`Unsupported action '${String(value)}'; use ${INSPECT_ACTIONS.join(', ')}.`)
}

/**
 * Reject a missing required parameter or a parameter owned by another action.
 * Runs before the CLI process, so a rejected call has no side effect.
 * @param action - selected inspect action.
 * @param args - tool arguments.
 * @returns nothing.
 */
function assertInspectArguments(action, args) {
  const accepted = new Set(['action', 'store', ...INSPECT_ACTION_PARAMETERS[action]])
  for (const key of Object.keys(args)) {
    if (accepted.has(key)) continue
    const owner = INSPECT_PARAMETER_OWNER[key]
    throw new Error(owner === undefined
      ? `Unsupported parameter '${key}' for action '${action}'.`
      : `'${key}' is only valid for the ${owner} action.`)
  }
  for (const key of INSPECT_REQUIRED_PARAMETERS[action]) {
    if (!hasText(args?.[key])) {
      throw new Error(`Action '${action}' requires '${key}'.`)
    }
  }
  if (action === 'validate') {
    const scope = args?.scope ?? 'change'
    if ((scope === 'change' || scope === 'spec') && !hasText(args?.change)) {
      throw new Error(`Action 'validate' requires 'change' when scope is '${scope}'.`)
    }
  }
}

/**
 * Report whether a value is a non-empty string.
 * @param value - candidate value.
 * @returns true when the value is a non-empty string.
 */
function hasText(value) {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Validate the requested validation scope.
 * @param args - tool arguments.
 * @returns the scope.
 */
function normalizeScope(args) {
  const value = args?.scope
  if (value === undefined || value === null) return 'change'
  if (value === 'change' || value === 'spec' || value === 'specs' || value === 'all') return value
  throw new Error(`Unsupported validate scope '${String(value)}'; use change, spec, specs or all.`)
}

/**
 * Project a `list --json` payload, preserving the setup:false contract.
 * @param json - parsed CLI payload.
 * @returns the tool projection.
 */
function projectListPayload(json) {
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
}

/**
 * Project a `list --specs --json` payload.
 * @param json - parsed CLI payload.
 * @returns the tool projection.
 */
function projectSpecListPayload(json) {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('openspec list --specs returned a non-object payload.')
  }
  if (json.specs === undefined && Array.isArray(json.status)) {
    throw errorFromStatus(json.status)
  }
  if (!Array.isArray(json.specs)) {
    throw new Error('openspec list --specs returned no specs array.')
  }
  return projectSpecList(json)
}


/** Resolve a plugin apply worktree session back to main; keep every other session where it is. */
function readCwd(sessionDir) {
  const main = mainWorktreeRoot(sessionDir)
  if (main === undefined) return sessionDir
  const root = join(main, '.cache', 'openspec-flow', 'worktrees') + sep
  return sessionDir.startsWith(root) ? main : sessionDir
}
