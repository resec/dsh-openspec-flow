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
