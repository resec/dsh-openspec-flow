import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../index.js'
import { createFakeContext } from './fake-context.mjs'
import { CLI_COMMAND } from './cli-command.mjs'

/**
 * Collect every description in a JSON Schema fragment.
 * @param node - schema node.
 * @param path - location used in a failure message.
 * @param out - collector.
 * @returns the collected descriptions.
 */
function collect(node, path, out = []) {
  if (node === null || typeof node !== 'object') return out
  if (typeof node.description === 'string') out.push({ path, text: node.description })
  for (const [key, value] of Object.entries(node)) {
    if (key === 'description') continue
    if (Array.isArray(value)) {
      value.forEach((item, index) => collect(item, `${path}.${key}[${index}]`, out))
    } else if (value !== null && typeof value === 'object') {
      collect(value, `${path}.${key}`, out)
    }
  }
  return out
}

test('no tool description names the CLI', () => {
  const fake = createFakeContext({ cwd: process.cwd() })
  apply(fake.ctx, { timeoutMs: 30_000 })
  assert.ok(fake.tools.size > 0, 'the plugin registers tools')

  for (const [name, tool] of fake.tools) {
    const entries = [{ path: name, text: tool.description }]
    entries.push(...collect(tool.parameters, `${name}.parameters`))
    entries.push(...collect(tool.output, `${name}.output`))
    for (const entry of entries) {
      assert.doesNotMatch(entry.text, /\bCLI\b/i, `${entry.path} must not mention the CLI`)
      assert.doesNotMatch(entry.text, /\bopsx\b/i, `${entry.path} must not name an alias command`)
    }
  }
})

test('store parameter description is uniform', () => {
  const fake = createFakeContext({ cwd: process.cwd() })
  apply(fake.ctx, { timeoutMs: 30_000 })

  const exposed = []
  for (const [name, tool] of fake.tools) {
    const store = tool.parameters?.properties?.store
    if (store === undefined) continue
    exposed.push({ name, description: store.description })
  }
  assert.ok(exposed.length > 0, 'at least one tool accepts store')
  for (const entry of exposed) {
    assert.equal(entry.description, 'Registered store id.', `${entry.name}.parameters.store`)
  }
})

test('review and worktree schemas declare extra round and cleanup fields', () => {
  const fake = createFakeContext({ cwd: process.cwd() })
  apply(fake.ctx, { timeoutMs: 30_000, reviews: { draft: { enabled: true }, apply: { enabled: true } } })
  const review = fake.tools.get('openspec_review')
  assert.ok(review, 'openspec_review is registered')
  const round = review.parameters.properties.round
  assert.ok(Array.isArray(round.anyOf), 'round accepts a number or a token')
  assert.deepEqual(round.anyOf.map((entry) => entry.type), ['integer', 'string'])
  assert.ok('roundToken' in review.output.schema.properties, 'the result declares roundToken')
  assert.ok('extraRounds' in review.output.schema.properties, 'the result declares extraRounds')
  assert.ok('revisions' in review.output.schema.properties, 'the result declares revisions')
  const worktree = fake.tools.get('openspec_apply_worktree')
  assert.match(worktree.description, /cleanup/, 'the land description names the cleanup')
  assert.ok('landCommit' in worktree.output.schema.properties, 'the land result declares landCommit')
  assert.ok('mergeCommit' in worktree.output.schema.properties, 'the land result keeps the legacy alias')
  const cleanup = worktree.output.schema.properties.cleanup
  assert.ok(cleanup, 'the land result declares cleanup')
  assert.deepEqual(cleanup.required, ['complete', 'worktreeRemoved', 'branchRemoved'])
})

test('the review action description names every accepted action', () => {
  const fake = createFakeContext({ cwd: process.cwd() })
  apply(fake.ctx, { timeoutMs: 30_000 })
  const action = fake.tools.get('openspec_review').parameters.properties.action
  assert.ok(Array.isArray(action.enum) && action.enum.length > 0, 'the action parameter enumerates its values')
  const rendered = `${action.enum.slice(0, -1).join(', ')} or ${action.enum.at(-1)}`
  assert.equal(
    action.description,
    `Review step to perform: ${rendered}.`,
    'the action description names every value and nothing the parameter does not accept',
  )
})

test('no tool description names an OpenSpec command', () => {
  const fake = createFakeContext({ cwd: process.cwd() })
  apply(fake.ctx, { timeoutMs: 30_000, reviews: { draft: { enabled: true }, apply: { enabled: true } } })
  assert.ok(fake.tools.has('openspec_review'), 'the review tool is registered for the scan')

  for (const [name, tool] of fake.tools) {
    const entries = [{ path: name, text: tool.description }]
    entries.push(...collect(tool.parameters, `${name}.parameters`))
    entries.push(...collect(tool.output, `${name}.output`))
    for (const entry of entries) {
      assert.doesNotMatch(entry.text, CLI_COMMAND, `${entry.path} must not name an OpenSpec command`)
    }
  }
})
