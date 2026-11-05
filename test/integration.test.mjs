import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { apply } from '../index.js'
import { cacheKey, clearCache, readCache } from '../lib/cache.js'
import { clearCliVerification, resolveBundledCli } from '../lib/openspec.js'
import { createFakeContext } from './fake-context.mjs'

const CHANGE = 'add-dark-mode'
const CHANGE_DIR = 'openspec/changes/add-dark-mode'
const PROBE_ROOT = fileURLToPath(new URL('../../.probe/proj/openspec', import.meta.url))
const TOOL_NAMES = [
  'openspec_apply_next',
  'openspec_list',
  'openspec_mark_task_done',
  'openspec_status',
  'openspec_validate',
]

const CLI = resolveBundledCli()
const created = []

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-e2e-'))
  cpSync(PROBE_ROOT, join(root, 'openspec'), { recursive: true })
  created.push(root)
  return root
}

function tasksPath(root) {
  return join(root, CHANGE_DIR, 'tasks.md')
}

const BUILTIN_SCHEMA_DIR = join(dirname(CLI), '..', 'schemas', 'spec-driven')

function addSchema(root, name) {
  const schemas = join(root, 'openspec', 'schemas')
  mkdirSync(schemas, { recursive: true })
  cpSync(BUILTIN_SCHEMA_DIR, join(schemas, name), { recursive: true })
}

function selectChangeSchema(root, name) {
  writeFileSync(
    join(root, CHANGE_DIR, '.openspec.yaml'),
    `schema: ${name}\ncreated: 2026-11-05\n`,
  )
}

function writeTasks(root, content) {
  writeFileSync(tasksPath(root), content)
}

function setup(root) {
  clearCache()
  const fake = createFakeContext({ cwd: root })
  apply(fake.ctx, { timeoutMs: 30_000 })
  return fake
}

async function call(fake, name, args) {
  const tool = fake.tools.get(name)
  assert.ok(tool, `tool ${name} is registered`)
  return await tool.execute(args, {
    agent: { id: 'integration-test' },
    signal: new AbortController().signal,
  })
}

function jsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value))
}

function rawApplyBytes(root) {
  const result = spawnSync(
    process.execPath,
    [CLI, 'instructions', 'apply', '--change', CHANGE, '--json'],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    },
  )
  assert.equal(result.status, 0, result.stderr)
  return Buffer.byteLength(result.stdout)
}

test.after(() => {
  for (const root of created) rmSync(root, { recursive: true, force: true })
})

test('registers five tools and the openspec-flow skill', () => {
  const root = fixture()
  const fake = setup(root)
  assert.deepEqual([...fake.tools.keys()].sort(), TOOL_NAMES)
  assert.equal(fake.skills.length, 1)
  assert.equal(fake.skills[0].name, 'openspec-flow')
  assert.equal(fake.skills[0].source, 'runtime')
  assert.ok(fake.skills[0].path.endsWith('skills/openspec-flow/SKILL.md'))
  assert.equal(fake.skills[0].invocation.modelInvocable, true)
  assert.equal(fake.skills[0].invocation.userInvocable, true)
  assert.match(fake.skills[0].description, /OpenSpec/)
  assert.match(fake.skills[0].content, /openspec_mark_task_done/)
})

test('verifies the bundled CLI once per process', async () => {
  const root = fixture()
  clearCliVerification()
  const fake = setup(root)

  await call(fake, 'openspec_status', { change: CHANGE })
  const afterFirst = fake.stats.spawns
  await call(fake, 'openspec_status', { change: CHANGE })

  assert.equal(fake.stats.spawns, afterFirst + 1, 'the second status reuses the verification')
})

test('ignores PATH and project-local openspec decoys', async () => {
  const root = fixture()
  const projectBin = join(root, 'node_modules', '.bin')
  mkdirSync(projectBin, { recursive: true })
  writeFileSync(join(projectBin, 'openspec'), '#!/bin/sh\nexit 42\n')

  const pathDir = mkdtempSync(join(tmpdir(), 'openspec-flow-path-'))
  created.push(pathDir)
  writeFileSync(join(pathDir, 'openspec'), '#!/bin/sh\nexit 42\n')
  const previousPath = process.env.PATH
  process.env.PATH = pathDir
  try {
    clearCliVerification()
    const fake = setup(root)
    const status = await call(fake, 'openspec_status', { change: CHANGE })
    assert.equal(status.schema, 'spec-driven')
  } finally {
    process.env.PATH = previousPath
  }
})

test('runs the apply loop, keeps 1.1 and 1.10 distinct, and finishes all_done', async () => {
  const root = fixture()
  writeTasks(root, [
    '## 1. First group',
    '',
    '- [ ] 1.1 First task',
    '- [ ] 1.10 Tenth task',
    '- [ ] 1.2 Second task',
    '',
    '## 2. Second group',
    '',
    '- [ ] 2.1 Third task',
    '- [ ] 2.2 Fourth task',
    '',
  ].join('\n'))
  const fake = setup(root)

  const list = await call(fake, 'openspec_list', {})
  assert.equal(list.setup, true)
  assert.equal(list.changes[0].name, CHANGE)

  const status = await call(fake, 'openspec_status', { change: CHANGE })
  assert.equal(status.schema, 'spec-driven')
  assert.equal(status.isPlanningComplete, true)
  assert.equal(status.artifacts.length, 4)
  assert.equal(status.artifacts[3].id, 'tasks')

  const before = readFileSync(tasksPath(root), 'utf8')
  let result = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(result.state, 'ready')
  assert.deepEqual(result.progress, { total: 5, complete: 0, remaining: 5 })
  assert.equal(result.taskCount, 5)
  assert.equal(result.next.id, '1.1')
  assert.equal(result.next.line, 3)
  assert.equal(result.contextFiles.proposal.length, 1)
  assert.match(result.instruction, /tasks|work|implementation/i)
  const spawnsAfterApply = fake.stats.spawns

  result = await call(fake, 'openspec_mark_task_done', {
    change: CHANGE,
    taskId: '1.1',
    sourcePath: result.next.sourcePath,
    line: result.next.line,
  })
  assert.equal(result.status, 'flipped')
  assert.deepEqual(result.progress, { total: 5, complete: 1, remaining: 4 })
  assert.equal(result.next.id, '1.10')

  const after = readFileSync(tasksPath(root), 'utf8')
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  assert.equal(beforeLines.length, afterLines.length)
  const changed = []
  for (let index = 0; index < beforeLines.length; index += 1) {
    if (beforeLines[index] !== afterLines[index]) changed.push(index)
  }
  assert.deepEqual(changed, [2])
  assert.equal(afterLines[2], beforeLines[2].replace('- [ ]', '- [x]'))

  result = await call(fake, 'openspec_mark_task_done', { change: CHANGE, taskId: '1.10' })
  assert.equal(result.next.id, '1.2')
  result = await call(fake, 'openspec_mark_task_done', { change: CHANGE, taskId: '1.2' })
  assert.equal(result.next.id, '2.1')
  result = await call(fake, 'openspec_mark_task_done', { change: CHANGE, taskId: '2.1' })
  assert.equal(result.next.id, '2.2')
  result = await call(fake, 'openspec_mark_task_done', { change: CHANGE, taskId: '2.2' })
  assert.equal(result.state, 'all_done')
  assert.equal(result.next, undefined)
  assert.deepEqual(result.progress, { total: 5, complete: 5, remaining: 0 })

  // The five marks ran without another CLI spawn; this is the O(N) loop.
  assert.equal(fake.stats.spawns, spawnsAfterApply)

  const again = await call(fake, 'openspec_mark_task_done', { change: CHANGE, taskId: '2.2' })
  assert.equal(again.status, 'already-done')
  assert.equal(again.state, 'all_done')
  await assert.rejects(
    call(fake, 'openspec_mark_task_done', { change: CHANGE, taskId: '9.9' }),
    /was not found/,
  )

  const validation = await call(fake, 'openspec_validate', { change: CHANGE })
  assert.equal(validation.valid, true)
  assert.deepEqual(validation.issues, [])
})

test('rejects a custom schema before caching apply state', async () => {
  const root = fixture()
  addSchema(root, 'custom')
  selectChangeSchema(root, 'custom')
  const fake = setup(root)

  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /Unsupported OpenSpec schema 'custom' for change 'add-dark-mode'.*built-in 'spec-driven'/s,
  )
  assert.equal(readCache(cacheKey(root, CHANGE, undefined)), undefined)
  await assert.rejects(
    call(fake, 'openspec_mark_task_done', { change: CHANGE, taskId: '1.1' }),
    /Unsupported OpenSpec schema 'custom'/,
  )
})

test('a cached apply entry cannot bypass a schema selection change', async () => {
  const root = fixture()
  writeTasks(root, '- [ ] 1.1 one\n- [ ] 1.2 two\n')
  const fake = setup(root)
  const applied = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(applied.next.id, '1.1')

  addSchema(root, 'custom')
  selectChangeSchema(root, 'custom')

  await assert.rejects(
    call(fake, 'openspec_mark_task_done', {
      change: CHANGE,
      taskId: '1.1',
      sourcePath: applied.next.sourcePath,
      line: applied.next.line,
    }),
    /Unsupported OpenSpec schema 'custom'/,
  )
  assert.match(readFileSync(tasksPath(root), 'utf8'), /- \[ \] 1\.1 one/)
})

test('rejects a custom schema in status and validate', async () => {
  const root = fixture()
  addSchema(root, 'custom')
  selectChangeSchema(root, 'custom')
  const fake = setup(root)

  await assert.rejects(
    call(fake, 'openspec_status', { change: CHANGE }),
    /Unsupported OpenSpec schema 'custom' for change 'add-dark-mode'/,
  )
  await assert.rejects(
    call(fake, 'openspec_validate', { change: CHANGE }),
    /Unsupported OpenSpec schema 'custom' for change 'add-dark-mode'/,
  )
})

test('rejects a project-local spec-driven schema in status', async () => {
  const root = fixture()
  addSchema(root, 'spec-driven')
  const fake = setup(root)

  await assert.rejects(
    call(fake, 'openspec_status', { change: CHANGE }),
    /shadowed by the project schema at .*openspec\/schemas\/spec-driven\/schema\.yaml/,
  )
})

test('refreshes the cache when the tracking file changed outside the tool', async () => {
  const root = fixture()
  writeTasks(root, '- [ ] 1.1 one\n- [ ] 1.2 two\n- [ ] 1.3 three\n')
  const fake = setup(root)
  let result = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(result.next.id, '1.1')
  const spawns = fake.stats.spawns
  writeFileSync(tasksPath(root), '- [ ] 1.1 one\n- [x] 1.2 two\n- [ ] 1.3 three\n')
  result = await call(fake, 'openspec_mark_task_done', { change: CHANGE, taskId: '1.1' })
  assert.equal(fake.stats.spawns, spawns + 1, 'a stale entry triggers one CLI refresh')
  assert.deepEqual(result.progress, { total: 3, complete: 2, remaining: 1 })
  assert.equal(result.next.id, '1.3')
})

test('reports a blocked change and refuses to mark tasks', async () => {
  const root = fixture()
  rmSync(tasksPath(root))
  const fake = setup(root)
  const result = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(result.state, 'blocked')
  assert.equal(result.next, undefined)
  assert.match(result.instruction, /Missing artifacts: tasks|tasks\.md/)
  await assert.rejects(
    call(fake, 'openspec_mark_task_done', { change: CHANGE, taskId: '1.1' }),
    /blocked/,
  )
})

test('preserves CRLF while marking', async () => {
  const root = fixture()
  const before = '- [ ] 1.1 one\r\n- [ ] 1.2 two\r\n'
  writeTasks(root, before)
  const fake = setup(root)
  const result = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(result.next.id, '1.1')
  const marked = await call(fake, 'openspec_mark_task_done', {
    change: CHANGE,
    taskId: '1.1',
    sourcePath: result.next.sourcePath,
    line: result.next.line,
  })
  assert.equal(marked.status, 'flipped')
  const after = readFileSync(tasksPath(root), 'utf8')
  assert.equal(after, before.replace('- [ ] 1.1 one', '- [x] 1.1 one'))
  const lines = after.split('\n')
  assert.equal(lines.at(-1), '')
  for (const line of lines.slice(0, -1)) assert.ok(line.endsWith('\r'), 'every line keeps CR')
})

test('39-task apply loop stays compact and spawns once', async () => {
  const root = fixture()
  const original = readFileSync(tasksPath(root), 'utf8')
  assert.equal((original.match(/- \[x\]/g) ?? []).length, 39)
  writeTasks(root, original.replace(/- \[x\]/g, '- [ ]'))
  const fake = setup(root)

  let result = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(result.progress.total, 39)
  assert.equal(result.next.id, '1.1')
  const applyBytes = jsonBytes(result)
  const rawBytes = rawApplyBytes(root)
  const spawnsAfterApply = fake.stats.spawns

  const sizes = []
  while (result.next !== undefined) {
    result = await call(fake, 'openspec_mark_task_done', {
      change: CHANGE,
      taskId: result.next.id,
    })
    sizes.push(jsonBytes(result))
  }
  assert.equal(result.state, 'all_done')
  assert.deepEqual(result.progress, { total: 39, complete: 39, remaining: 0 })
  assert.equal(fake.stats.spawns, spawnsAfterApply, 'no CLI spawn between tasks')

  const total = applyBytes + sizes.reduce((sum, size) => sum + size, 0)
  const naive = rawBytes * 39
  const average = Math.round((sizes.reduce((sum, size) => sum + size, 0)) / sizes.length)
  console.log(
    `39-task: raw=${rawBytes}B apply_next=${applyBytes}B marks=${sizes.length} avg=${average}B total=${total}B naive=${naive}B ratio=${(total / naive * 100).toFixed(1)}%`,
  )
  assert.ok(total < naive * 0.1, `expected <10% of the repeated-query bytes, got ${total}/${naive}`)

  const validation = await call(fake, 'openspec_validate', { change: CHANGE })
  assert.equal(validation.valid, true)
})
