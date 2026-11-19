import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { apply } from '../index.js'
import { createFakeContext } from './fake-context.mjs'
import { PROBE_ROOT } from './review-fixtures.mjs'

const CHANGE = 'add-dark-mode'
const CREATED = []

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'openspec-inspect-'))
  cpSync(PROBE_ROOT, join(root, 'openspec'), { recursive: true })
  CREATED.push(root)
  return root
}

function setup() {
  const fake = createFakeContext({ cwd: fixture() })
  apply(fake.ctx, { timeoutMs: 30_000 })
  return fake
}

async function inspect(fake, action, args = {}) {
  const tool = fake.tools.get('openspec_inspect')
  assert.ok(tool, 'openspec_inspect is registered')
  return await tool.execute({ action, ...args }, {
    agent: { id: 'inspect-test' },
    signal: new AbortController().signal,
  })
}

/**
 * Match a value against the subset of JSON Schema the output contract uses.
 * @param schema - schema node.
 * @param value - candidate value.
 * @returns true when the value matches.
 */
function matches(schema, value) {
  if (Array.isArray(schema.oneOf)) {
    return schema.oneOf.filter((branch) => matches(branch, value)).length === 1
  }
  if (schema.const !== undefined) return value === schema.const
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false
  if (schema.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
    for (const key of schema.required ?? []) {
      if (!(key in value)) return false
    }
    for (const [key, child] of Object.entries(value)) {
      const property = schema.properties?.[key]
      if (property === undefined) {
        if (schema.additionalProperties === false) return false
        continue
      }
      if (!matches(property, child)) return false
    }
    return true
  }
  if (schema.type === 'array') {
    return Array.isArray(value) && value.every((item) => matches(schema.items ?? {}, item))
  }
  if (schema.type === 'string') return typeof value === 'string'
  if (schema.type === 'number') return typeof value === 'number'
  if (schema.type === 'boolean') return typeof value === 'boolean'
  return true
}

test.after(() => {
  for (const root of CREATED) rmSync(root, { recursive: true, force: true })
})

test('registers one read entry and no former read tools', () => {
  const fake = setup()
  const names = [...fake.tools.keys()]
  assert.equal(names.length, 10)
  assert.ok(names.includes('openspec_inspect'))
  for (const old of ['openspec_list', 'openspec_status', 'openspec_show', 'openspec_instructions', 'openspec_context', 'openspec_validate']) {
    assert.ok(!names.includes(old), `${old} is not registered`)
  }
})

test('pins the inspect schema under the replaced six-tool cost', () => {
  const fake = setup()
  const definition = fake.tools.get('openspec_inspect')
  const size = definition.name.length
    + definition.description.length
    + JSON.stringify(definition.parameters).length
  assert.ok(size < 3820, `inspect schema is ${size} characters`)
})

test('rejects a missing required parameter before the read starts', async () => {
  const fake = setup()
  await assert.rejects(inspect(fake, 'status', {}), /Action 'status' requires 'change'\./)
  await assert.rejects(inspect(fake, 'show', {}), /Action 'show' requires 'name'\./)
  await assert.rejects(inspect(fake, 'instructions', { change: CHANGE }), /Action 'instructions' requires 'artifact'\./)
  await assert.rejects(inspect(fake, 'worktree', {}), /Action 'worktree' requires 'change'\./)
  await assert.rejects(inspect(fake, 'worktree', { change: CHANGE, artifact: 'proposal' }), /'artifact' is only valid for the instructions action\./)
  assert.equal(fake.stats.spawns, 0)
})

test('rejects a parameter owned by another action', async () => {
  const fake = setup()
  await assert.rejects(
    inspect(fake, 'list', { artifact: 'proposal' }),
    /'artifact' is only valid for the instructions action\./,
  )
  await assert.rejects(
    inspect(fake, 'context', { change: CHANGE }),
    /'change' is only valid for the status, instructions, validate or worktree action\./,
  )
  assert.equal(fake.stats.spawns, 0)
})

test('rejects an unknown action', async () => {
  const fake = setup()
  await assert.rejects(inspect(fake, 'bogus'), /Unsupported action 'bogus'/)
  assert.equal(fake.stats.spawns, 0)
})

test('every action matches exactly one output branch', async () => {
  const fake = setup()
  const schema = fake.tools.get('openspec_inspect').output.schema
  const results = {
    list: await inspect(fake, 'list'),
    specs: await inspect(fake, 'list', { specs: true }),
    status: await inspect(fake, 'status', { change: CHANGE }),
    show: await inspect(fake, 'show', { name: CHANGE }),
    instructions: await inspect(fake, 'instructions', { change: CHANGE, artifact: 'proposal' }),
    context: await inspect(fake, 'context'),
    validate: await inspect(fake, 'validate', { change: CHANGE }),
    validateSpecs: await inspect(fake, 'validate', { scope: 'specs' }),
    worktree: await inspect(fake, 'worktree', { change: CHANGE }),
  }
  for (const [action, result] of Object.entries(results)) {
    assert.equal(matches(schema, result), true, `${action} matches exactly one branch`)
  }
})

test('skills, policy and README name no former read tool', () => {
  const skills = readdirSync(new URL('../skills/', import.meta.url), { recursive: true })
    .filter((name) => name.endsWith('SKILL.md'))
    .map((name) => fileURLToPath(new URL(`../skills/${name}`, import.meta.url)))
  const files = [
    ...skills,
    fileURLToPath(new URL('../lib/policy.js', import.meta.url)),
    fileURLToPath(new URL('../README.md', import.meta.url)),
  ]
  const former = [
    'openspec_list',
    'openspec_status',
    'openspec_show',
    'openspec_instructions',
    'openspec_context',
    'openspec_validate',
  ]
  assert.ok(files.length >= 7, 'found the packaged skills and the two documents')
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const name of former) {
      assert.ok(!text.includes(name), `${name} is still named in ${file}`)
    }
  }
})

test('rejects an unknown parameter, a blank value and a missing validate change', async () => {
  const fake = setup()
  await assert.rejects(
    inspect(fake, 'list', { bogus: true }),
    /Unsupported parameter 'bogus' for action 'list'\./,
  )
  await assert.rejects(
    inspect(fake, 'status', { change: '   ' }),
    /Action 'status' requires 'change'\./,
  )
  await assert.rejects(
    inspect(fake, 'validate', { scope: 'change' }),
    /Action 'validate' requires 'change' when scope is 'change'\./,
  )
  await assert.rejects(inspect(fake, undefined), /Unsupported action 'undefined'/)
  assert.equal(fake.stats.spawns, 0)
})
