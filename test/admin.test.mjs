import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../index.js'
import {
  ADMIN_COMMAND,
  ADMIN_TOOLS,
  closeAdmin,
  isAdminOpen,
  openAdmin,
  resetAdminState,
} from '../lib/admin.js'
import { createFakeContext } from './fake-context.mjs'

const CORE_TOOLS = [
  'openspec_apply_next',
  'openspec_apply_worktree',
  'openspec_archive',
  'openspec_inspect',
  'openspec_mark_task_done',
  'openspec_new_change',
  'openspec_review',
]

/**
 * Build a fake host with a command registry and no running tools.
 * @returns the fake context.
 */
function setup() {
  resetAdminState()
  const fake = createFakeContext({ cwd: process.cwd(), commands: true })
  apply(fake.ctx, {})
  return fake
}

/**
 * Resolve the tools one agent would see, applying each registration's condition.
 * @param fake - fake context.
 * @param agent - viewing agent.
 * @returns visible tool names.
 */
function visibleTools(fake, agent) {
  return [...fake.tools.keys()].filter((name) => {
    const options = fake.toolOptions.get(name)
    return options?.when === undefined || options.when({ agent })
  })
}

test('the block opens for one turn and closes when the agent returns to idle', () => {
  const fake = setup()
  const { agent, steered } = fake.createAgent()
  const command = fake.commands[0]

  assert.equal(command.name, ADMIN_COMMAND)
  assert.deepEqual(visibleTools(fake, agent).sort(), CORE_TOOLS)

  const opened = command.handler({ agent, rawInput: 'initialize this project' })
  assert.equal(opened.kind, 'success')
  assert.equal(isAdminOpen(agent), true)
  assert.equal(steered.length, 1)
  assert.equal(steered[0].content[0].text, 'initialize this project')
  assert.equal(steered[0].source.kind, 'user')

  const openNames = visibleTools(fake, agent)
  assert.equal(openNames.length, 10)
  for (const name of ADMIN_TOOLS) assert.ok(openNames.includes(name), `${name} is visible while open`)

  fake.setStatus(agent, 'running')
  fake.setStatus(agent, 'idle')

  assert.equal(isAdminOpen(agent), false)
  assert.deepEqual(visibleTools(fake, agent).sort(), CORE_TOOLS)
  resetAdminState()
})

test('a command without an intent returns usage and leaves the block closed', () => {
  const fake = setup()
  const { agent } = fake.createAgent()
  const command = fake.commands[0]

  const result = command.handler({ agent, rawInput: '   ' })

  assert.equal(result.kind, 'error')
  assert.match(result.text, /Usage: \/opsx-admin/)
  assert.equal(isAdminOpen(agent), false)
  resetAdminState()
})

test('the off argument closes the block early', () => {
  const fake = setup()
  const { agent } = fake.createAgent()
  const command = fake.commands[0]

  command.handler({ agent, rawInput: 'list the stores' })
  assert.equal(isAdminOpen(agent), true)

  const closed = command.handler({ agent, rawInput: 'off' })
  assert.equal(closed.kind, 'success')
  assert.equal(isAdminOpen(agent), false)
  assert.deepEqual(visibleTools(fake, agent).sort(), CORE_TOOLS)
  resetAdminState()
})

test('the block tracks a turn that was already running when it opened', () => {
  const fake = setup()
  const { agent } = fake.createAgent()
  const command = fake.commands[0]
  agent.status = 'running'

  command.handler({ agent, rawInput: 'list the schemas' })
  fake.setStatus(agent, 'idle')

  assert.equal(isAdminOpen(agent), false)
  resetAdminState()
})

test('a host without a command registry keeps every tool visible', () => {
  resetAdminState()
  const fake = createFakeContext({ cwd: process.cwd(), commands: false })
  apply(fake.ctx, {})

  assert.equal(fake.commands.length, 0)
  const { agent } = fake.createAgent()
  assert.equal(fake.toolOptions.get('openspec_init').when({ agent }), true)
  assert.equal(visibleTools(fake, agent).length, 10)
  resetAdminState()
})

test('status events for an unopened agent are ignored', () => {
  const fake = setup()
  const { agent } = fake.createAgent()

  fake.emit('agent/status', { agent, status: 'running' })
  fake.emit('agent/status', { agent, status: 'idle' })
  assert.equal(isAdminOpen(agent), false)

  openAdmin(undefined)
  closeAdmin(null)
  assert.equal(isAdminOpen(undefined), false)
  resetAdminState()
})

test('an idle event before the turn starts does not close the block', () => {
  const fake = setup()
  const { agent } = fake.createAgent()
  const command = fake.commands[0]

  command.handler({ agent, rawInput: 'list the stores' })
  fake.emit('agent/status', { agent, status: 'idle' })

  assert.equal(isAdminOpen(agent), true)
  resetAdminState()
})

test('a command registry without register keeps every tool visible', () => {
  resetAdminState()
  const fake = createFakeContext({ cwd: process.cwd(), commands: {} })
  apply(fake.ctx, {})

  const { agent } = fake.createAgent()
  assert.equal(visibleTools(fake, agent).length, 10)
  resetAdminState()
})

test('the review tool follows the global switch', () => {
  resetAdminState()
  const enabled = createFakeContext({ cwd: process.cwd(), commands: true })
  apply(enabled.ctx, { reviewEnabled: true })
  const enabledAgent = enabled.createAgent().agent
  assert.ok(visibleTools(enabled, enabledAgent).includes('openspec_review'), 'the switch keeps the tool')

  resetAdminState()
  const disabled = createFakeContext({ cwd: process.cwd(), commands: true })
  apply(disabled.ctx, { reviewEnabled: false })
  const disabledAgent = disabled.createAgent().agent
  assert.equal(visibleTools(disabled, disabledAgent).includes('openspec_review'), false, 'the switch hides the tool')
  resetAdminState()
})
