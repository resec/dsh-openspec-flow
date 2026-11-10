/**
 * A small structural stand-in for the Host context.
 *
 * It implements only the members the plugin reads: `tools.register`,
 * `subprocess.spawn`, `workingDirectory.ensure` and `workingDirectory.get`,
 * `get('skills')` with `register` and `registerProvider`,
 * `get('systemPrompt')`/`systemPrompt`, `agents.list`,
 * `on('agent/created')`, `effect`, and `logger.warn`. The subprocess half
 * wraps Node's own `spawn` while honoring the collected-output contract.
 *
 * Policy tests create agents through `createAgent`; each agent carries its own
 * scoped context whose `systemPrompt.section` records sections for assertions.
 */

import { spawn } from 'node:child_process'

/**
 * Build a fake context and the registries it fills.
 * @param {object} options - `cwd`, an optional `skills` flag, and optional seed
 *   agents already live at load time.
 * @returns the fake context plus the registries and helpers tests read.
 */
export function createFakeContext({ cwd, skills: withSkills = true, agents: seedAgents = [], commands: withCommands = false } = {}) {
  const tools = new Map()
  const toolOptions = new Map()
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
  const stats = { spawns: 0 }
  const listeners = new Map()
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

  const ctx = {
    logger: {
      warn() {},
      info() {},
    },
    systemPrompt: globalSystemPrompt,
    agents: {
      list() {
        return [...liveAgents]
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
  function createAgent({ id = `session-${liveAgents.length + 1}`, directory } = {}) {
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
    const session = { id }
    const agent = {
      id,
      session,
      ctx: agentContext,
      status: 'idle',
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
    tools,
    toolOptions,
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
  }
}
