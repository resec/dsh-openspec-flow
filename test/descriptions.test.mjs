import assert from 'node:assert/strict'
import { cpSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { apply } from '../index.js'
import { resolveBundledCli } from '../lib/openspec.js'
import { createFakeContext } from './fake-context.mjs'
import {
  CHANGE, call, cleanupFixtures, fixture, gitFixture, passDraft, report, setup,
} from './review-fixtures.mjs'

test.after(cleanupFixtures)

/** A bare `openspec <command>` invocation, which no agent can run. */
const CLI_COMMAND = /\bopenspec (?:archive|cli|config|context|diff|init|instructions|list|new|schemas|show|specs|status|store|update|validate|view|workset)\b/i

/** The change names this repository tracks in its own archive. */
const INTERNAL_CHANGE = new RegExp(
  `\\b(?:${readdirSync(fileURLToPath(new URL('../openspec/changes/archive/', import.meta.url)))
    .map((entry) => entry.replace(/^\d{4}-\d{2}-\d{2}-/u, ''))
    .join('|')})\\b`,
)

/**
 * Run a call that must fail and return its message.
 * @param pending - the failing call.
 * @returns the error message.
 */
async function rejection(pending) {
  try {
    await pending
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  assert.fail('the call must fail')
}

/** The built-in schema directory the bundled CLI resolves. */
const BUILTIN_SCHEMA_DIR = join(dirname(resolveBundledCli()), '..', 'schemas', 'spec-driven')

/**
 * Add a resolvable schema directory so the CLI accepts the selection.
 * @param root - project root.
 * @param name - schema directory name.
 */
function addSchema(root, name) {
  mkdirSync(join(root, 'openspec', 'schemas'), { recursive: true })
  cpSync(BUILTIN_SCHEMA_DIR, join(root, 'openspec', 'schemas', name), { recursive: true })
}

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
  const worktree = fake.tools.get('openspec_apply_worktree')
  assert.match(worktree.description, /cleanup/, 'the land description names the cleanup')
  assert.ok('landCommit' in worktree.output.schema.properties, 'the land result declares landCommit')
  assert.ok('mergeCommit' in worktree.output.schema.properties, 'the land result keeps the legacy alias')
  const cleanup = worktree.output.schema.properties.cleanup
  assert.ok(cleanup, 'the land result declares cleanup')
  assert.deepEqual(cleanup.required, ['complete', 'worktreeRemoved', 'branchRemoved'])
})

test('tool errors name no CLI command and no internal change name', async () => {
  const { root, run } = gitFixture()
  const worktree = setup(root, undefined, { worktree: { enabled: true } })
  await passDraft(worktree, root, run)
  await call(worktree, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(worktree, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  const archiveError = await rejection(call(worktree, 'openspec_archive', { change: CHANGE }))

  const customRoot = fixture()
  addSchema(customRoot, 'custom')
  writeFileSync(
    join(customRoot, 'openspec', 'changes', CHANGE, '.openspec.yaml'),
    'schema: custom\ncreated: 2026-11-05\n',
  )
  const customError = await rejection(call(setup(customRoot), 'openspec_inspect', {
    action: 'status', change: CHANGE,
  }))

  const shadowRoot = fixture()
  addSchema(shadowRoot, 'spec-driven')
  const shadowError = await rejection(call(setup(shadowRoot), 'openspec_inspect', {
    action: 'status', change: CHANGE,
  }))

  for (const [label, message] of [['archive', archiveError], ['custom schema', customError], ['shadowed schema', shadowError]]) {
    assert.doesNotMatch(message, /\bCLI\b/i, `the ${label} error must not mention the CLI: ${message}`)
    assert.doesNotMatch(message, CLI_COMMAND, `the ${label} error must not name a command: ${message}`)
    assert.doesNotMatch(message, INTERNAL_CHANGE, `the ${label} error must not name an internal change: ${message}`)
  }
  assert.match(archiveError, /openspec_apply_worktree action=land/u, 'the archive error names land')
  assert.match(archiveError, /openspec_apply_worktree action=remove/u, 'the archive error names remove')
  assert.match(customError, /openspec_new_change/u, 'the custom-schema error names the create tool')
  assert.match(shadowError, /Remove that schema directory/u, 'the shadowed-schema error names the fix')
})
