/**
 * The management block: a user-opened, one-turn exposure window for the
 * plugin's management tools.
 *
 * The block is process-local on purpose. It ends when the agent returns to
 * idle, so a resumed or forked session starts closed and never reconstructs
 * visibility from the log.
 *
 * The block has no model-facing entry point: only the `/opsx-admin` command
 * opens it, and that command is dispatched by a UI adapter, never by the model.
 *
 * @module dsh-openspec-flow/admin
 */

import { randomUUID } from 'node:crypto'

/** Command name; DSH parses command names as `[a-z][a-z0-9_-]*`, so a colon is invalid. */
export const ADMIN_COMMAND = 'opsx-admin'

/** Tools hidden from the model while the block is closed. */
export const ADMIN_TOOLS = Object.freeze([
  'openspec_init',
  'openspec_store_list',
  'openspec_schemas',
])

/** Agent -> `{ running }`; the marker keeps the opening idle event from closing the block. */
let OPEN = new WeakMap()

/** Whether this host can open the block at all. */
let enforced = false

/** Reset the process-local block state; a test seam and a plugin-reload boundary. */
export function resetAdminState() {
  OPEN = new WeakMap()
  enforced = false
}

/**
 * Report whether the block is open for one agent.
 * @param agent - agent to inspect.
 * @returns whether the block is open.
 */
export function isAdminOpen(agent) {
  return agent !== undefined && agent !== null && OPEN.has(agent)
}

/**
 * Report whether one agent may see a management tool.
 * @param agent - agent whose catalog is being resolved.
 * @returns true when the host cannot gate, or when the block is open.
 */
export function adminToolsVisible(agent) {
  return !enforced || isAdminOpen(agent)
}

/**
 * Open the block for one agent and remember whether its turn is already running.
 * @param agent - agent whose next turns see the management tools.
 * @returns nothing.
 */
export function openAdmin(agent) {
  if (agent === undefined || agent === null) return
  OPEN.set(agent, { running: agent.status === 'running' })
}

/**
 * Close the block for one agent.
 * @param agent - agent whose catalog loses the management tools.
 * @returns nothing.
 */
export function closeAdmin(agent) {
  if (agent === undefined || agent === null) return
  OPEN.delete(agent)
}

/**
 * Recursively freeze a message value.
 * @param value - the value to freeze.
 * @returns the same value, frozen in place.
 */
function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

/**
 * Build the user message a command steers into the conversation.
 *
 * The platform's `createUserMessage` is a runtime import from a platform
 * package, which a linked profile install cannot resolve, so the documented
 * public message shape is used directly.
 *
 * @param text - the intent the user typed after the command.
 * @returns a frozen user message with a fresh identity.
 */
export function adminIntentMessage(text) {
  return deepFreeze({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  })
}

/** Usage text returned for a command without an argument. */
export const ADMIN_USAGE = 'Usage: /opsx-admin <intent> (or /opsx-admin off)'

/**
 * Execute one `/opsx-admin` invocation.
 * @param invocation - the command runtime's invocation.
 * @returns the command result the dispatching surface renders.
 */
export function handleAdminCommand(invocation) {
  const agent = invocation.agent
  const input = invocation.rawInput.trim()
  if (input === '') return { kind: 'error', text: ADMIN_USAGE }
  if (input === 'off') {
    if (!isAdminOpen(agent)) return { kind: 'success', text: 'The management block is already closed.' }
    closeAdmin(agent)
    return { kind: 'success', text: 'The management block is closed.' }
  }
  openAdmin(agent)
  agent.steer(adminIntentMessage(input))
  return {
    kind: 'success',
    text: `The management block is open for this turn: ${ADMIN_TOOLS.join(', ')}.`,
  }
}

/**
 * Register the block subscription and the `/opsx-admin` command.
 *
 * A host without a command registry cannot open the block, so the management
 * tools stay always visible there instead of becoming unreachable.
 *
 * @param ctx - host context that may carry `commands`.
 * @returns nothing.
 */
export function registerAdminGate(ctx) {
  // The command registry is optional, so it must be read through `ctx.get`;
  // a property read requires the service to be listed in `inject`.
  const commands = ctx.get?.('commands')
  if (commands === undefined || commands === null || typeof commands.register !== 'function') {
    ctx.logger?.warn?.(
      'openspec-flow: no command registry, so /opsx-admin is unavailable and the management tools stay always visible.',
    )
    return
  }
  enforced = true
  ctx.effect(() => ctx.on('agent/status', ({ agent, status }) => {
    const entry = OPEN.get(agent)
    if (entry === undefined) return
    if (status === 'running') {
      entry.running = true
    } else if (status === 'idle' && entry.running) {
      OPEN.delete(agent)
    }
  }))
  ctx.effect(() => commands.register({
    name: ADMIN_COMMAND,
    description: 'Open the OpenSpec management tools (init, store list, schemas) for the current turn',
    input: { hint: '<intent> | off' },
    handler: handleAdminCommand,
  }))
}
