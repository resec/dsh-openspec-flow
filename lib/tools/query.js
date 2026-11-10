/**
 * Read-only tools: list, status and validate.
 *
 * @module dsh-openspec-flow/tools/query
 */

import { errorFromStatus, runOpenSpec, throwIfOnlyStatus, withStore } from '../openspec.js'
import { adminToolsVisible } from '../admin.js'
import { assertBuiltinSchema, projectRootFromStatus } from '../schema.js'
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
 * Register `openspec_list`.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
export function registerListTool(ctx, settings) {
  ctx.effect(() => ctx.tools.register({
    name: 'openspec_list',
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
      const cwd = await sessionCwd(ctx, exec)
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
  }))
}

/**
 * Register `openspec_status`.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
export function registerStatusTool(ctx, settings) {
  ctx.effect(() => ctx.tools.register({
    name: 'openspec_status',
    description: 'Inspect one OpenSpec change: schema, artifact completion, blockedBy, next steps as tool actions, and edit constraints. Use it before writing planning artifacts or before starting apply. Only the built-in spec-driven schema is supported; custom or shadowed schemas are rejected.',
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
                  enum: ['openspec_instructions', 'openspec_apply_next'],
                },
                arguments: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
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
      return projectStatus(json, { store: optionalStore(args) })
    },
  }))
}

/**
 * Register `openspec_instructions`.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
export function registerInstructionsTool(ctx, settings) {
  ctx.effect(() => ctx.tools.register({
    name: 'openspec_instructions',
    description: 'Read the instruction for a planning artifact (proposal, specs, design, tasks) or the archive operation inputs. Artifact results carry the instruction, output path, dependencies and unlocks, plus the project context and rules when configured; the archive result carries the project context and archive guidance when configured. Use it before writing or revising an artifact or before archiving. Only the built-in spec-driven schema is supported; custom or shadowed schemas are rejected.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['change', 'artifact'],
      properties: {
        change: {
          type: 'string',
          description: 'Change name, exactly as openspec_list reports it.',
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
      const cwd = await sessionCwd(ctx, exec)
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
  }))
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
 * Register `openspec_show`.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
export function registerShowTool(ctx, settings) {
  ctx.effect(() => ctx.tools.register({
    name: 'openspec_show',
    description: 'Read one OpenSpec change or spec. A change returns its delta requirements; a spec returns its purpose, requirements and scenarios. Use noScenarios to skip scenario text, and type when a change and a spec share a name.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          description: 'Change or spec id, exactly as openspec_list reports it.',
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
      const cwd = await sessionCwd(ctx, exec)
      const command = ['show', name, '--json']
      if (type !== undefined) command.push('--type', type)
      if (args?.noScenarios === true) command.push('--no-scenarios')
      const { json } = await runOpenSpec(ctx, settings, cwd, withStore(command, optionalStore(args)), exec.signal)
      throwIfOnlyStatus(json, ['title'])
      return projectShow(json)
    },
  }))
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
    tool: { type: 'string', enum: ['openspec_show'] },
    arguments: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'store'],
      properties: {
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
 * Register `openspec_context`.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
export function registerContextTool(ctx, settings) {
  ctx.effect(() => ctx.tools.register({
    name: 'openspec_context',
    description: 'Read the working context for the resolved OpenSpec root: the root with its store id when store-selected, referenced stores, and diagnostics. Use it to discover the root or confirm setup before proposing. An available referenced store carries a fetch action naming openspec_show and the argument it still needs.',
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
      const cwd = await sessionCwd(ctx, exec)
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
  }))
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
      const cwd = await sessionCwd(ctx, exec)
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
    description: 'List registered OpenSpec stores with their ids and roots. Use it before asking for a store id or passing store to other tools.',
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
      const cwd = await sessionCwd(ctx, exec)
      const { json } = await runOpenSpec(ctx, settings, cwd, ['store', 'list', '--json'], exec.signal)
      if (json === null || typeof json !== 'object' || Array.isArray(json)) {
        throw new Error('openspec store list returned a non-object payload.')
      }
      return projectStoreList(json)
    },
  }, { when: ({ agent }) => adminToolsVisible(agent) }))
}

/**
 * Register `openspec_validate`.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
export function registerValidateTool(ctx, settings) {
  ctx.effect(() => ctx.tools.register({
    name: 'openspec_validate',
    description: 'Validate one OpenSpec change, one spec, all specs, or everything, and return compact findings. Use it after the last task and before archiving. Change validation supports only the built-in spec-driven schema; custom or shadowed schemas are rejected.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        change: {
          type: 'string',
          description: 'Change or spec name. Required when scope is change or spec.',
        },
        scope: {
          type: 'string',
          enum: ['change', 'spec', 'specs', 'all'],
          description: 'What to validate. Defaults to change.',
        },
        strict: {
          type: 'boolean',
          description: 'Turn warnings into failures, matching openspec validate --strict.',
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
      const cwd = await sessionCwd(ctx, exec)
      const flags = strict ? ['--strict'] : []

      if (scope === 'change') {
        const change = requireChange(args)
        await assertSupportedChangeSchema(ctx, settings, cwd, change, store, exec.signal)
        const { json } = await runOpenSpec(
          ctx,
          settings,
          cwd,
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
  }))
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
