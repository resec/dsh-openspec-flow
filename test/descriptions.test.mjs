import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../index.js'
import { createFakeContext } from './fake-context.mjs'

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

test('shared parameter descriptions are uniform', () => {
  const fake = createFakeContext({ cwd: process.cwd() })
  apply(fake.ctx, { timeoutMs: 30_000, reviews: { draft: { enabled: true }, apply: { enabled: true } } })

  // Derive the shared set instead of naming it: a parameter exposed by more
  // than three tools is shared. Three is the count where per-tool enums such
  // as action and scope differ in meaning, so they stay out of the set.
  const exposed = new Map()
  for (const [name, tool] of fake.tools) {
    for (const [param, schema] of Object.entries(tool.parameters?.properties ?? {})) {
      if (!exposed.has(param)) exposed.set(param, new Map())
      exposed.get(param).set(name, schema.description)
    }
  }

  const shared = [...exposed].filter(([, tools]) => tools.size > 3)
  const names = shared.map(([param]) => param)
  assert.ok(names.includes('change'), 'change is a shared parameter')
  assert.ok(names.includes('store'), 'store is a shared parameter')

  for (const [param, tools] of shared) {
    const [[firstTool, firstDescription]] = tools
    for (const [toolName, description] of tools) {
      assert.equal(description, firstDescription, `${toolName}.parameters.${param} differs from ${firstTool}.parameters.${param}`)
    }
  }
  assert.equal(exposed.get('store').values().next().value, 'Registered store id.')
})

test('tool descriptions do not repeat store usage guidance', () => {
  const fake = createFakeContext({ cwd: process.cwd() })
  apply(fake.ctx, { timeoutMs: 30_000, reviews: { draft: { enabled: true }, apply: { enabled: true } } })
  assert.ok(fake.tools.size > 0, 'the plugin registers tools')

  for (const [name, tool] of fake.tools) {
    assert.doesNotMatch(tool.description, /Pass store/i, `${name}.description must not repeat store usage`)
    assert.doesNotMatch(tool.description, /Use it before asking for a store id/i, `${name}.description must not repeat store usage`)
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
  const worktree = fake.tools.get('openspec_apply_worktree')
  assert.match(worktree.description, /cleanup/, 'the land description names the cleanup')
  assert.ok('landCommit' in worktree.output.schema.properties, 'the land result declares landCommit')
  assert.ok('mergeCommit' in worktree.output.schema.properties, 'the land result keeps the legacy alias')
  const cleanup = worktree.output.schema.properties.cleanup
  assert.ok(cleanup, 'the land result declares cleanup')
  assert.deepEqual(cleanup.required, ['complete', 'worktreeRemoved', 'branchRemoved'])
})
