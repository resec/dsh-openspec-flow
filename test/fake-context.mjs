/**
 * A small structural stand-in for the Host context.
 *
 * It implements only the members the plugin reads: `tools.register`,
 * `subprocess.spawn`, `workingDirectory.ensure` and `workingDirectory.get`,
 * `get('skills')` with `register` and `registerProvider`,
 * `get('systemPrompt')`/`systemPrompt`, `agents.list`,
 * `get('agentDefaultModel')`, `get('llm')`, `on('agent/created')`, `effect`,
 * and `logger.warn`. The subprocess half wraps Node's own `spawn` while
 * honoring the collected-output contract.
 *
 * Policy tests create agents through `createAgent`; each agent carries its own
 * scoped context whose `systemPrompt.section` records sections for assertions.
 */

import { spawn } from 'node:child_process'
import { createInprocSpawner } from './inproc-cli.mjs'

const inprocSpawner = createInprocSpawner()

/**
 * Build a fake context and the registries it fills.
 * @param {object} options - `cwd`, an optional `skills` flag, and optional seed
 *   agents already live at load time.
 * @returns the fake context plus the registries and helpers tests read.
 */
export function createFakeContext({
  cwd,
  skills: withSkills = true,
  agents: seedAgents = [],
  commands: withCommands = false,
  subagents = undefined,
  modelSelection = { provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'max' },
  catalog = undefined,
  globalTools = [],
  sessionProjections = undefined,
  spawnMode = 'inproc',
} = {}) {
  const tools = new Map()
  const toolOptions = new Map()
  const restrictions = []
  const warnings = []
  const hostToolNames = [...globalTools]
  const skills = []
  const providers = new Map()
  const commands = []
  const commandRegistry = withCommands === true
    ? {
        register(definition) {
          commands.push(definition)
          return () => {
            const index = commands.indexOf(definition)
            if (index !== -1) commands.splice(index, 1)
          }
        },
      }
    : typeof withCommands === 'object' && withCommands !== null
      ? withCommands
      : undefined
  const stats = { spawns: 0, inprocCalls: 0, childProcesses: 0 }
  const listeners = new Map()
  const projectionRegistrations = []
  const projectionService = sessionProjections ?? {
    register(definition) {
      projectionRegistrations.push(definition)
      return Promise.resolve({})
    },
  }
  const liveAgents = [...seedAgents]
  const sessionDirectories = new Map()

  const collected = (getText) => ({
    readFrom() {
      const text = getText()
      return { text, nextOffset: Buffer.byteLength(text), lossy: false }
    },
  })

  const globalSystemPrompt = {    /** Record one global section; policy must never take this path. */
    section(definition) {
      globalSystemPrompt.sections.push(definition)
      return () => {}
    },
    sections: [],
    getSectionOrder() {
      return 500
    },
  }

  // The model catalog the review tools read: one provider, one model, one effort.
  const models = new Map([
    ['deepseek', [{ provider: 'deepseek', id: 'deepseek-flash', name: 'DeepSeek Flash' }]],
  ])
  const llm = catalog ?? {
    listProviders() {
      return [...models.keys()].map((id) => ({ id, name: id }))
    },
    async listModels(provider) {
      return models.get(provider) ?? []
    },
    async resolveModelInfo(provider, model) {
      const entry = (models.get(provider) ?? []).find((candidate) => candidate.id === model)
      if (entry === undefined) throw new Error(`model '${provider}/${model}' is not in the catalog`)
      return { ...entry, reasoning: { efforts: [{ id: 'max', name: 'Max' }], defaultEffort: 'max' } }
    },
  }
  const agentDefaultModel = {
    currentSelection() {
      return { ...modelSelection }
    },
  }

  const ctx = {
    logger: {
      warn(message) {
        warnings.push(message)
      },
      info() {},
    },
    systemPrompt: globalSystemPrompt,
    agents: {
      list() {
        return [...liveAgents]
      },
      get(id) {
        return liveAgents.find((agent) => agent.id === id)
      },
    },
    workingDirectory: {
      defaultDirectory: cwd,
      get(session) {
        const id = session?.id
        return sessionDirectories.get(id) ?? cwd
      },
      async ensure() {
        return cwd
      },
    },
    subprocess: {
      spawn(spec) {
        stats.spawns += 1
        if (spawnMode === 'inproc') {
          stats.inprocCalls += 1
          return inprocSpawner.spawn(spec)
        }
        stats.childProcesses += 1
        const child = spawn(spec.argv[0], spec.argv.slice(1), {
          cwd: spec.cwd,
          env: { ...process.env, ...spec.env },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        let stdout = ''
        let stderr = ''
        child.stdout.setEncoding('utf8')
        child.stderr.setEncoding('utf8')
        child.stdout.on('data', (chunk) => {
          stdout += chunk
        })
        child.stderr.on('data', (chunk) => {
          stderr += chunk
        })
        const done = new Promise((resolve, reject) => {
          child.on('error', reject)
          child.on('close', (exitCode, signal) => resolve({ exitCode, signal }))
        })
        const onAbort = () => {
          child.kill('SIGTERM')
        }
        if (spec.signal !== undefined) {
          if (spec.signal.aborted) onAbort()
          else spec.signal.addEventListener('abort', onAbort, { once: true })
        }
        return {
          stdin: undefined,
          stdout: child.stdout,
          stderr: child.stderr,
          control: undefined,
          collected: {
            stdout: collected(() => stdout),
            stderr: collected(() => stderr),
          },
          done,
          terminate() {
            child.kill('SIGTERM')
          },
          waitForExit() {
            return done.then(() => true)
          },
        }
      },
    },
    tools: {
      register(definition, options) {
        tools.set(definition.name, definition)
        toolOptions.set(definition.name, options)
        return () => {
          tools.delete(definition.name)
          toolOptions.delete(definition.name)
        }
      },
      definitions(scope) {
        if (scope !== undefined) return []
        return hostToolNames.map((name) => ({ name }))
      },
      restrict(filter) {
        restrictions.push(filter)
        return () => {
          const index = restrictions.indexOf(filter)
          if (index !== -1) restrictions.splice(index, 1)
        }
      },
    },
    on(event, listener) {
      const list = listeners.get(event) ?? []
      list.push(listener)
      listeners.set(event, list)
      return () => {
        const index = list.indexOf(listener)
        if (index !== -1) list.splice(index, 1)
      }
    },
    get(name) {
      if (name === 'skills' && withSkills) {
        return {
          register(definition) {
            skills.push(definition)
            return () => {}
          },
          registerProvider(create) {
            const controller = new AbortController()
            const provider = create({
              signal: controller.signal,
              invalidate() {},
            })
            providers.set(provider.name, provider)
            return () => {
              providers.delete(provider.name)
              controller.abort()
            }
          },
        }
      }
      if (name === 'systemPrompt') return globalSystemPrompt
      if (name === 'agents') return ctx.agents
      if (name === 'agentDefaultModel') return agentDefaultModel
      if (name === 'llm') return llm
      if (name === 'subagents') return subagents
      if (name === 'sessionProjections') return projectionService
      if (name === 'commands') return commandRegistry
      return undefined
    },
    effect(fn) {
      return fn()
    },
  }

  // Cordis rejects a property read for a service the plugin did not inject;
  // model that here so a `ctx.commands` read fails in tests too.
  Object.defineProperty(ctx, 'commands', {
    get() {
      throw new Error('cannot get property "commands" without inject')
    },
  })

  /**
   * Create a live agent with its own scoped context.
   * @param {object} options - agent id and initial directory.
   * @returns the agent and the sections registered in its scope.
   */
  function createAgent({ id = `session-${liveAgents.length + 1}`, directory, parentSession, status = 'idle' } = {}) {
    const sections = []
    const steered = []
    const agentContext = {
      systemPrompt: {
        section(definition) {
          sections.push(definition)
          return () => {}
        },
        getSectionOrder() {
          return 500
        },
      },
      effect(fn) {
        return fn()
      },
      get(name) {
        return name === 'systemPrompt' ? agentContext.systemPrompt : undefined
      },
    }
    const session = {
      id,
      header: {
        id,
        ...(parentSession === undefined ? {} : { parentSession }),
      },
    }
    const agent = {
      id,
      session,
      ctx: agentContext,
      status,
      model: {
        current() {
          return { ...modelSelection }
        },
      },
      steer(message) {
        steered.push(message)
      },
    }
    if (directory !== undefined) sessionDirectories.set(id, directory)
    liveAgents.push(agent)
    return { agent, sections, steered }
  }

  /**
   * Set an agent's status and deliver the host event listeners observe.
   * @param agent - the agent whose status changes.
   * @param status - `running` or `idle`.
   */
  function setStatus(agent, status) {
    agent.status = status
    emit('agent/status', { agent, status })
  }

  /**
   * Move an existing session to another directory.
   * @param id - session id.
   * @param directory - new absolute directory.
   */
  function setCwd(id, directory) {
    sessionDirectories.set(id, directory)
  }

  /**
   * Deliver one host event to its listeners.
   * @param event - event name.
   * @param payload - event payload.
   */
  function emit(event, payload) {
    for (const listener of listeners.get(event) ?? []) listener(payload)
  }

  return {
    ctx,
    llm,
    models,
    agentDefaultModel,
    tools,
    toolOptions,
    restrictions,
    warnings,
    globalTools: hostToolNames,
    skills,
    providers,
    commands,
    stats,
    createAgent,
    setCwd,
    setStatus,
    emit,
    liveAgents,
    globalSections: globalSystemPrompt.sections,
    projectionRegistrations,
  }
}
