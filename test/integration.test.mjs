import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { apply } from '../index.js'
import { resetAdminState } from '../lib/admin.js'
import { cacheKey, clearCache, readCache } from '../lib/cache.js'
import { clearCliVerification, resolveBundledCli } from '../lib/openspec.js'
import { parseTaskLines, taskKey } from '../lib/tasks.js'
import { createFakeContext } from './fake-context.mjs'

const CHANGE = 'add-dark-mode'
const CHANGE_DIR = 'openspec/changes/add-dark-mode'
const PROBE_ROOT = fileURLToPath(new URL('../../.probe/proj/openspec', import.meta.url))
const TOOL_NAMES = [
  'openspec_apply_next',
  'openspec_archive',
  'openspec_init',
  'openspec_inspect',
  'openspec_mark_task_done',
  'openspec_new_change',
  'openspec_schemas',
  'openspec_store_list',
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

async function inspectCall(fake, action, args = {}) {
  return await call(fake, 'openspec_inspect', { action, ...args })
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

test('registers the tool set and the skill provider', async () => {
  const root = fixture()
  const fake = setup(root)
  assert.deepEqual([...fake.tools.keys()].sort(), TOOL_NAMES)
  const provider = fake.providers.get('openspec-flow')
  assert.ok(provider, 'the skill provider is registered')
  const candidates = await provider.list()
  assert.deepEqual(
    candidates.map((candidate) => candidate.name).sort(),
    [...PLUGIN_SKILLS].sort(),
  )
  const definition = await provider.get(candidates.find((candidate) => candidate.name === 'openspec-apply-change'))
  assert.match(definition.content, /openspec_mark_task_done/)
})

test('verifies the bundled CLI once per process', async () => {
  const root = fixture()
  clearCliVerification()
  const fake = setup(root)

  await inspectCall(fake, 'status', { change: CHANGE })
  const afterFirst = fake.stats.spawns
  await inspectCall(fake, 'status', { change: CHANGE })

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
    const status = await inspectCall(fake, 'status', { change: CHANGE })
    assert.equal(status.schema, 'spec-driven')
  } finally {
    process.env.PATH = previousPath
  }
})

test('reports blockedBy and the blocking artifact instruction while planning is incomplete', async () => {
  const root = fixture()
  rmSync(join(root, CHANGE_DIR, 'design.md'))
  const fake = setup(root)

  const status = await inspectCall(fake, 'status', { change: CHANGE })
  assert.equal(status.isPlanningComplete, false)
  assert.deepEqual(status.blockedBy, ['design'])
  assert.deepEqual(status.nextSteps, [
    { tool: 'openspec_inspect', arguments: { change: CHANGE, action: 'instructions', artifact: 'design' } },
  ])
  assert.doesNotMatch(JSON.stringify(status), /Run openspec /)
})

test('reports an apply_next action and no blocker once planning is complete', async () => {
  const root = fixture()
  const fake = setup(root)

  const status = await inspectCall(fake, 'status', { change: CHANGE })
  assert.equal(status.isPlanningComplete, true)
  assert.equal(status.blockedBy, undefined)
  assert.deepEqual(status.nextSteps, [
    { tool: 'openspec_apply_next', arguments: { change: CHANGE } },
  ])
  assert.doesNotMatch(JSON.stringify(status), /openspec (instructions|apply) --/)
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

  const list = await inspectCall(fake, 'list', {})
  assert.equal(list.setup, true)
  assert.equal(list.changes[0].name, CHANGE)

  const status = await inspectCall(fake, 'status', { change: CHANGE })
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
  assert.equal(result.next.sourcePath, `${CHANGE_DIR}/tasks.md`)
  assert.equal(result.contextFiles.proposal.length, 1)
  assert.equal(result.contextFiles.proposal[0], `${CHANGE_DIR}/proposal.md`)
  assert.equal(result.root.path, root)
  assert.match(result.instruction, /tasks|work|implementation/i)
  const spawnsAfterApply = fake.stats.spawns

  result = await call(fake, 'openspec_mark_task_done', {
    change: CHANGE,
    taskIds: ['1.1'],
    sourcePath: result.next.sourcePath,
    line: result.next.line,
  })
  assert.deepEqual(result.results, [{ id: '1.1', status: 'flipped' }])
  assert.deepEqual(result.progress, { total: 5, complete: 1, remaining: 4 })
  assert.equal(result.next.id, '1.10')
  assert.equal(result.next.sourcePath, `${CHANGE_DIR}/tasks.md`)
  assert.equal(result.root, undefined)

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

  result = await call(fake, 'openspec_mark_task_done', { change: CHANGE, taskIds: ['1.10'] })
  assert.equal(result.next.id, '1.2')
  result = await call(fake, 'openspec_mark_task_done', { change: CHANGE, taskIds: ['1.2'] })
  assert.equal(result.next.id, '2.1')
  result = await call(fake, 'openspec_mark_task_done', { change: CHANGE, taskIds: ['2.1'] })
  assert.equal(result.next.id, '2.2')
  result = await call(fake, 'openspec_mark_task_done', { change: CHANGE, taskIds: ['2.2'] })
  assert.equal(result.state, 'all_done')
  assert.equal(result.next, undefined)
  assert.deepEqual(result.progress, { total: 5, complete: 5, remaining: 0 })

  // The five marks ran without another CLI spawn; this is the O(N) loop.
  assert.equal(fake.stats.spawns, spawnsAfterApply)

  const again = await call(fake, 'openspec_mark_task_done', { change: CHANGE, taskIds: ['2.2'] })
  assert.deepEqual(again.results, [{ id: '2.2', status: 'already-done' }])
  assert.equal(again.state, 'all_done')
  await assert.rejects(
    call(fake, 'openspec_mark_task_done', { change: CHANGE, taskIds: ['9.9'] }),
    /was not found/,
  )

  const validation = await inspectCall(fake, 'validate', { change: CHANGE })
  assert.equal(validation.valid, true)
  assert.deepEqual(validation.issues, [])
})

test('marks a task with an absolute source path as well', async () => {
  const root = fixture()
  writeTasks(root, '- [ ] 1.1 one\n- [ ] 1.2 two\n')
  const fake = setup(root)
  const applied = await call(fake, 'openspec_apply_next', { change: CHANGE })
  const result = await call(fake, 'openspec_mark_task_done', {
    change: CHANGE,
    taskIds: [applied.next.id],
    sourcePath: join(root, applied.next.sourcePath),
    line: applied.next.line,
  })
  assert.deepEqual(result.results, [{ id: '1.1', status: 'flipped' }])
  assert.equal(result.progress.complete, 1)
})

test('marks a batch of tasks in one call', async () => {
  const root = fixture()
  writeTasks(root, '- [ ] 1.1 one\n- [ ] 1.2 two\n- [x] 1.3 three\n- [ ] 1.4 four\n')
  const fake = setup(root)
  const applied = await call(fake, 'openspec_apply_next', { change: CHANGE })
  const spawns = fake.stats.spawns
  const result = await call(fake, 'openspec_mark_task_done', {
    change: CHANGE,
    taskIds: [applied.next.id, '1.2', '1.3'],
    sourcePath: applied.next.sourcePath,
    line: applied.next.line,
  })
  assert.deepEqual(result.results, [
    { id: '1.1', status: 'flipped' },
    { id: '1.2', status: 'flipped' },
    { id: '1.3', status: 'already-done' },
  ])
  assert.deepEqual(result.progress, { total: 4, complete: 3, remaining: 1 })
  assert.equal(result.next.id, '1.4')
  assert.equal(fake.stats.spawns, spawns, 'a batch needs no query')
  const lines = readFileSync(tasksPath(root), 'utf8').split('\n')
  assert.equal(lines[0], '- [x] 1.1 one')
  assert.equal(lines[1], '- [x] 1.2 two')
  assert.equal(lines[2], '- [x] 1.3 three')
  assert.equal(lines[3], '- [ ] 1.4 four')
})

test('marks a duplicated id once', async () => {
  const root = fixture()
  writeTasks(root, '- [ ] 1.1 one\n- [ ] 1.2 two\n')
  const fake = setup(root)
  await call(fake, 'openspec_apply_next', { change: CHANGE })
  const result = await call(fake, 'openspec_mark_task_done', {
    change: CHANGE,
    taskIds: ['1.1', '1.1', '#1'],
  })
  assert.deepEqual(result.results, [{ id: '1.1', status: 'flipped' }])
  assert.deepEqual(result.progress, { total: 2, complete: 1, remaining: 1 })
})

test('a batch with an unknown id changes nothing and can be retried', async () => {
  const root = fixture()
  const before = '- [ ] 1.1 one\n- [ ] 1.2 two\n'
  writeTasks(root, before)
  const fake = setup(root)
  await call(fake, 'openspec_apply_next', { change: CHANGE })
  await assert.rejects(
    call(fake, 'openspec_mark_task_done', {
      change: CHANGE,
      taskIds: ['1.1', '9.9', '1.2'],
    }),
    /Task '9\.9' was not found[\s\S]*No task was marked because a batch writes only when every id is found/,
  )
  assert.equal(readFileSync(tasksPath(root), 'utf8'), before)
  const corrected = await call(fake, 'openspec_mark_task_done', {
    change: CHANGE,
    taskIds: ['1.1', '1.2'],
  })
  assert.deepEqual(corrected.results, [
    { id: '1.1', status: 'flipped' },
    { id: '1.2', status: 'flipped' },
  ])
  assert.equal(corrected.state, 'all_done')
})

test('rejects an empty or malformed taskIds list before writing', async () => {
  const root = fixture()
  writeTasks(root, '- [ ] 1.1 one\n')
  const fake = setup(root)

  await assert.rejects(
    call(fake, 'openspec_mark_task_done', { change: CHANGE, taskIds: [] }),
    /taskIds must be a non-empty array of task ids/,
  )
  await assert.rejects(
    call(fake, 'openspec_mark_task_done', { change: CHANGE, taskIds: ['1.1', 2] }),
    /Every taskIds entry must be a non-empty task id/,
  )
  assert.match(readFileSync(tasksPath(root), 'utf8'), /- \[ \] 1\.1 one/)
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
    call(fake, 'openspec_mark_task_done', { change: CHANGE, taskIds: ['1.1'] }),
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
      taskIds: ['1.1'],
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
    inspectCall(fake, 'status', { change: CHANGE }),
    /Unsupported OpenSpec schema 'custom' for change 'add-dark-mode'/,
  )
  await assert.rejects(
    inspectCall(fake, 'validate', { change: CHANGE }),
    /Unsupported OpenSpec schema 'custom' for change 'add-dark-mode'/,
  )
})

test('rejects a project-local spec-driven schema in status', async () => {
  const root = fixture()
  addSchema(root, 'spec-driven')
  const fake = setup(root)

  await assert.rejects(
    inspectCall(fake, 'status', { change: CHANGE }),
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
  result = await call(fake, 'openspec_mark_task_done', { change: CHANGE, taskIds: ['1.1'] })
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
    call(fake, 'openspec_mark_task_done', { change: CHANGE, taskIds: ['1.1'] }),
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
    taskIds: ['1.1'],
    sourcePath: result.next.sourcePath,
    line: result.next.line,
  })
  assert.deepEqual(marked.results, [{ id: '1.1', status: 'flipped' }])
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

  const ids = parseTaskLines(readFileSync(tasksPath(root), 'utf8'))
    .filter((task) => task.description.length > 0)
    .map((task) => taskKey(task))
  const sizes = []
  for (let index = 0; index < ids.length; index += 4) {
    result = await call(fake, 'openspec_mark_task_done', {
      change: CHANGE,
      taskIds: ids.slice(index, index + 4),
    })
    sizes.push(jsonBytes(result))
    if (index + 4 < ids.length) {
      assert.equal(result.next.id, ids[index + 4], 'next follows the batch')
    }
  }
  assert.equal(result.state, 'all_done')
  assert.deepEqual(result.progress, { total: 39, complete: 39, remaining: 0 })
  assert.equal(fake.stats.spawns, spawnsAfterApply, 'no CLI spawn between batches')

  const total = applyBytes + sizes.reduce((sum, size) => sum + size, 0)
  const naive = rawBytes * 39
  const average = Math.round((sizes.reduce((sum, size) => sum + size, 0)) / sizes.length)
  console.log(
    `39-task: raw=${rawBytes}B apply_next=${applyBytes}B batches=${sizes.length} avg=${average}B total=${total}B naive=${naive}B ratio=${(total / naive * 100).toFixed(1)}%`,
  )
  assert.ok(total < naive * 0.02, `expected <2% of the repeated-query bytes, got ${total}/${naive}`)

  const validation = await inspectCall(fake, 'validate', { change: CHANGE })
  assert.equal(validation.valid, true)
})

test('lists capability specs through openspec_list', async () => {
  const root = fixture()
  const specDir = join(root, 'openspec', 'specs', 'theme')
  mkdirSync(specDir, { recursive: true })
  writeFileSync(join(specDir, 'spec.md'), [
    '# Theme',
    '',
    '## Purpose',
    '',
    'Lets users choose a theme for the app.',
    '',
    '## Requirements',
    '',
    '### Requirement: Theme selection',
    'The app SHALL let users choose a theme.',
    '',
    '#### Scenario: Toggle',
    '- **WHEN** the user toggles the theme',
    '- **THEN** the theme changes',
    '',
  ].join('\n'))
  const fake = setup(root)

  const result = await inspectCall(fake, 'list', { specs: true })
  assert.equal(result.setup, true)
  assert.deepEqual(result.specs.map((spec) => spec.id), ['theme'])
  assert.equal(result.specs[0].requirementCount, 1)
  assert.equal(result.changes, undefined)
})

test('validates specs and single specs through scope', async () => {
  const root = fixture()
  const specDir = join(root, 'openspec', 'specs', 'theme')
  mkdirSync(specDir, { recursive: true })
  writeFileSync(join(specDir, 'spec.md'), [
    '# Theme',
    '',
    '## Purpose',
    '',
    'Lets users choose a theme for the app.',
    '',
    '## Requirements',
    '',
    '### Requirement: Theme selection',
    'The app SHALL let users choose a theme.',
    '',
    '#### Scenario: Toggle',
    '- **WHEN** the user toggles the theme',
    '- **THEN** the theme changes',
    '',
  ].join('\n'))
  const fake = setup(root)

  const report = await inspectCall(fake, 'validate', { scope: 'specs' })
  assert.equal(report.scope, 'specs')
  assert.equal(report.valid, true)
  assert.ok(report.items.some((item) => item.id === 'theme'))

  const single = await inspectCall(fake, 'validate', { scope: 'spec', change: 'theme' })
  assert.equal(single.scope, 'spec')
  assert.equal(single.items.length, 1)
  assert.equal(single.items[0].id, 'theme')

  await assert.rejects(
    inspectCall(fake, 'validate', { scope: 'bogus', change: 'theme' }),
    /Unsupported validate scope/,
  )
})

test('reads planning instructions through openspec_inspect', async () => {
  const root = fixture()
  const fake = setup(root)

  const result = await inspectCall(fake, 'instructions', { change: CHANGE, artifact: 'proposal' })
  assert.equal(result.change, CHANGE)
  assert.equal(result.artifact, 'proposal')
  assert.equal(result.schema, 'spec-driven')
  assert.match(result.instruction, /proposal/i)
  assert.doesNotMatch(result.instruction, /`openspec (list|show|validate|instructions)/)
  assert.match(result.instruction, /openspec_inspect/)
  assert.match(result.instruction, /action: "list"/)
  assert.match(result.instruction, /`store: "<id>"`/)
  assert.match(result.instruction, /`type: "spec"`/)
  assert.match(result.instruction, /`specs: true`/)
  assert.ok(result.outputPath.endsWith('proposal.md'))
  assert.ok(result.existingOutputPaths.length >= 1)
  assert.deepEqual(result.dependencies, [])
  assert.deepEqual(result.unlocks, ['specs', 'design'])

  const expected = {
    specs: { dependencies: ['proposal'], unlocks: ['tasks'] },
    design: { dependencies: ['proposal'], unlocks: ['tasks'] },
    tasks: { dependencies: ['specs', 'design'], unlocks: [] },
  }
  for (const [artifact, values] of Object.entries(expected)) {
    const other = await inspectCall(fake, 'instructions', { change: CHANGE, artifact })
    assert.equal(other.artifact, artifact)
    assert.doesNotMatch(other.instruction, /`--(store|type|specs)\b/)
    assert.deepEqual(other.dependencies, values.dependencies)
    assert.deepEqual(other.unlocks, values.unlocks)
    assert.doesNotMatch(JSON.stringify(other.dependencies), /\[object Object\]/)
    assert.ok(other.outputPath.length > 0)
  }

  await assert.rejects(
    inspectCall(fake, 'instructions', { change: CHANGE, artifact: 'bogus' }),
    /artifact must be one of/,
  )
})

test('does not rewrite configured context or rules', async () => {
  const root = fixture()
  writeFileSync(join(root, 'openspec', 'config.yaml'), [
    'schema: spec-driven',
    'context: Use `--store` when the project is store-selected.',
    'rules:',
    '  proposal:',
    '    - Keep `--type` literal in examples.',
  ].join('\n'))
  const fake = setup(root)

  const result = await inspectCall(fake, 'instructions', { change: CHANGE, artifact: 'proposal' })
  assert.equal(result.context, 'Use `--store` when the project is store-selected.')
  assert.deepEqual(result.rules, ['Keep `--type` literal in examples.'])
  assert.doesNotMatch(result.instruction, /`--(store|type|specs)\b/)
})

test('surfaces project context, rules and operation guidance', async () => {
  const root = fixture()
  writeFileSync(join(root, 'openspec', 'config.yaml'), [
    'schema: spec-driven',
    'context: Follow the project glossary.',
    'rules:',
    '  proposal:',
    '    - Keep the proposal under one page.',
    'operations:',
    '  apply:',
    '    guidance:',
    '      - Keep apply summaries short.',
    '  archive:',
    '    guidance:',
    '      - Summarize the archive outcome.',
    '',
  ].join('\n'))
  const fake = setup(root)

  const proposal = await inspectCall(fake, 'instructions', { change: CHANGE, artifact: 'proposal' })
  assert.equal(proposal.context, 'Follow the project glossary.')
  assert.deepEqual(proposal.rules, ['Keep the proposal under one page.'])
  assert.equal(proposal.artifact, 'proposal')

  const archive = await inspectCall(fake, 'instructions', { change: CHANGE, artifact: 'archive' })
  assert.equal(archive.change, CHANGE)
  assert.equal(archive.artifact, 'archive')
  assert.equal(archive.context, 'Follow the project glossary.')
  assert.deepEqual(archive.guidance, ['Summarize the archive outcome.'])
  assert.equal(archive.instruction, undefined)
  assert.equal(archive.outputPath, undefined)
  assert.equal(archive.root.path, root)

  const apply = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(apply.context, 'Follow the project glossary.')
  assert.deepEqual(apply.guidance, ['Keep apply summaries short.'])
  assert.equal(apply.state, 'all_done')
})

test('omits project configuration when the config has none', async () => {
  const root = fixture()
  const fake = setup(root)

  const proposal = await inspectCall(fake, 'instructions', { change: CHANGE, artifact: 'proposal' })
  assert.equal(proposal.context, undefined)
  assert.equal(proposal.rules, undefined)

  const archive = await inspectCall(fake, 'instructions', { change: CHANGE, artifact: 'archive' })
  assert.deepEqual(Object.keys(archive).sort(), ['artifact', 'change', 'root'])
  assert.equal(archive.context, undefined)
  assert.equal(archive.guidance, undefined)

  const apply = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(apply.context, undefined)
  assert.equal(apply.guidance, undefined)
})

test('shows changes and specs through one tool', async () => {
  const root = fixture()
  const specDir = join(root, 'openspec', 'specs', 'theme')
  mkdirSync(specDir, { recursive: true })
  writeFileSync(join(specDir, 'spec.md'), [
    '# Theme',
    '',
    '## Purpose',
    '',
    'Lets users choose a theme for the app.',
    '',
    '## Requirements',
    '',
    '### Requirement: Theme selection',
    'The app SHALL let users choose a theme.',
    '',
    '#### Scenario: Toggle',
    '- **WHEN** the user toggles the theme',
    '- **THEN** the theme changes',
    '',
  ].join('\n'))
  const fake = setup(root)

  const change = await inspectCall(fake, 'show', { name: CHANGE })
  assert.equal(change.kind, 'change')
  assert.ok(change.deltaCount >= 1)
  assert.ok(change.deltas[0].requirements.length >= 1)

  const spec = await inspectCall(fake, 'show', { name: 'theme', type: 'spec' })
  assert.equal(spec.kind, 'spec')
  assert.equal(spec.name, 'theme')
  assert.equal(spec.requirements[0].name, 'Theme selection')
  assert.equal(spec.requirements[0].scenarios.length, 1)

  const noScenarios = await inspectCall(fake, 'show', { name: 'theme', type: 'spec', noScenarios: true })
  assert.equal(noScenarios.requirements[0].scenarios.length, 0)
})

test('reads context, schemas and registered stores', async () => {
  const root = fixture()
  const fake = setup(root)

  const context = await inspectCall(fake, 'context', {})
  assert.equal(context.setup, true)
  assert.equal(context.root.path, root)
  assert.equal(context.root.store_id, undefined)
  assert.deepEqual(context.members, [])
  assert.deepEqual(context.status, [])

  const schemas = await call(fake, 'openspec_schemas', {})
  assert.equal(schemas.schemas.length, 1)
  assert.equal(schemas.schemas[0].name, 'spec-driven')
  assert.equal(schemas.schemas[0].source, 'package')
  assert.ok(Array.isArray(schemas.schemas[0].artifacts))

  const stores = await call(fake, 'openspec_store_list', {})
  assert.ok(Array.isArray(stores.stores))
  assert.ok(Array.isArray(stores.status))
})

test('creates a change through openspec_new_change', async () => {
  const root = fixture()
  const fake = setup(root)

  const result = await call(fake, 'openspec_new_change', {
    name: 'add-light-mode',
    description: 'Add a light theme',
  })
  assert.equal(result.change.id, 'add-light-mode')
  assert.equal(result.change.path, 'openspec/changes/add-light-mode')
  assert.equal(result.change.schema, 'spec-driven')
  assert.ok(existsSync(join(root, result.change.path, '.openspec.yaml')))

  await assert.rejects(
    call(fake, 'openspec_new_change', { name: 'add-light-mode' }),
    /exists|already/i,
  )
})

test('omits a project-local schema shadow from openspec_schemas', async () => {
  const root = fixture()
  addSchema(root, 'spec-driven')
  const fake = setup(root)

  const schemas = await call(fake, 'openspec_schemas', {})
  assert.deepEqual(schemas.schemas, [])
})

test('rejects a new change when the project selects a custom schema', async () => {
  const root = fixture()
  writeFileSync(join(root, 'openspec', 'config.yaml'), 'schema: custom\n')
  const fake = setup(root)

  await assert.rejects(
    call(fake, 'openspec_new_change', { name: 'add-light-mode' }),
    /Unsupported OpenSpec schema 'custom'/,
  )
  assert.equal(existsSync(join(root, 'openspec', 'changes', 'add-light-mode')), false)
})

test('rejects a new change when the project schema shadows the built-in', async () => {
  const root = fixture()
  addSchema(root, 'spec-driven')
  const fake = setup(root)

  await assert.rejects(
    call(fake, 'openspec_new_change', { name: 'add-light-mode' }),
    /shadowed by the project schema/,
  )
  assert.equal(existsSync(join(root, 'openspec', 'changes', 'add-light-mode')), false)
})

test('refuses to create a change without a root', async () => {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-empty-'))
  created.push(root)
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_new_change', { name: 'add-light-mode' }),
    /No OpenSpec root/,
  )
})

test('archives a completed change and merges its specs', async () => {
  const root = fixture()
  const fake = setup(root)

  const result = await call(fake, 'openspec_archive', { change: CHANGE })
  assert.equal(result.valid, true)
  assert.equal(result.archived, true)
  assert.match(result.archivedAs, /add-dark-mode$/)
  assert.ok(result.path.startsWith('openspec/changes/archive/'))
  assert.ok(existsSync(join(root, result.path)))
  assert.equal(result.root.path, root)
  assert.equal(existsSync(join(root, CHANGE_DIR)), false)
  assert.ok(existsSync(join(root, 'openspec', 'specs', 'theme', 'spec.md')))
})

test('refuses to archive while tasks remain', async () => {
  const root = fixture()
  writeTasks(root, readFileSync(tasksPath(root), 'utf8').replace('- [x]', '- [ ]'))
  const fake = setup(root)

  await assert.rejects(
    call(fake, 'openspec_archive', { change: CHANGE }),
    /incomplete task/,
  )
  assert.ok(existsSync(join(root, CHANGE_DIR)))
})

test('returns validation findings instead of archiving a broken change', async () => {
  const root = fixture()
  writeFileSync(
    join(root, CHANGE_DIR, 'specs', 'theme', 'spec.md'),
    '# Delta\n\n## ADDED Requirements\n\n### Requirement: Broken\nNo scenario.\n',
  )
  const fake = setup(root)

  const result = await call(fake, 'openspec_archive', { change: CHANGE })
  assert.equal(result.valid, false)
  assert.equal(result.archived, false)
  assert.ok(result.issues.length > 0)
  assert.ok(existsSync(join(root, CHANGE_DIR)))
})

function writeParsingChange(root, name, specBody) {
  const dir = join(root, 'openspec', 'changes', name)
  mkdirSync(join(dir, 'specs', 'demo'), { recursive: true })
  writeFileSync(join(dir, '.openspec.yaml'), 'schema: spec-driven\ncreated: 2026-11-08\n')
  writeFileSync(
    join(dir, 'proposal.md'),
    [
      '# Delta parsing',
      '',
      '## Why',
      'The parser must report the bundled CLI result.',
      '',
      '## What Changes',
      '- Exercise delta section parsing.',
      '',
    ].join('\n'),
  )
  writeFileSync(join(dir, 'design.md'), '# Design\n\n## Approach\n\nNone.\n')
  writeFileSync(join(dir, 'tasks.md'), '# Tasks\n\n## 1. Work\n\n- [x] 1.1 Exercise the parser\n')
  writeFileSync(join(dir, 'specs', 'demo', 'spec.md'), specBody)
  return dir
}

test('reads a delta section heading closed with a hash run', async () => {
  const root = fixture()
  const name = 'closed-heading'
  writeParsingChange(
    root,
    name,
    [
      '## ADDED Requirements ##',
      '',
      '### Requirement: Demo behavior',
      'The demo SHALL behave.',
      '',
      '#### Scenario: Demo runs',
      '- **WHEN** the demo runs',
      '- **THEN** it behaves',
      '',
    ].join('\n'),
  )
  const fake = setup(root)

  const shown = await inspectCall(fake, 'show', { name })
  assert.equal(shown.kind, 'change')
  assert.equal(shown.deltaCount, 1)
  assert.deepEqual(
    shown.deltas[0].requirements.map((requirement) => requirement.name),
    ['Demo behavior'],
  )

  const validated = await inspectCall(fake, 'validate', { change: name })
  assert.equal(validated.valid, true)
  assert.deepEqual(validated.issues, [])
})

test('refuses a requirement under an unrecognized delta section', async () => {
  const root = fixture()
  const name = 'unknown-section'
  writeParsingChange(
    root,
    name,
    [
      '## ADDED Requirements',
      '',
      '### Requirement: Supported behavior',
      'The demo SHALL behave.',
      '',
      '#### Scenario: Demo runs',
      '- **WHEN** the demo runs',
      '- **THEN** it behaves',
      '',
      '## DEPRECATED Requirements',
      '',
      '### Requirement: Retired behavior',
      'The demo SHALL keep a retired behavior.',
      '',
      '#### Scenario: Retired path',
      '- **WHEN** the retired path runs',
      '- **THEN** it holds',
      '',
    ].join('\n'),
  )
  const fake = setup(root)

  const validated = await inspectCall(fake, 'validate', { change: name })
  assert.equal(validated.valid, false)
  const error = validated.issues.find(
    (issue) => issue.level === 'ERROR' && issue.message.includes('Retired behavior'),
  )
  assert.ok(error, JSON.stringify(validated.issues))
  assert.match(error.message, /## DEPRECATED Requirements/)

  const archived = await call(fake, 'openspec_archive', { change: name })
  assert.equal(archived.valid, false)
  assert.equal(archived.archived, false)
  assert.ok(archived.issues.some((issue) => issue.message.includes('Retired behavior')))
  assert.ok(existsSync(join(root, 'openspec', 'changes', name)))
})

test('reports an unwritable project instead of writing partially', async (t) => {
  if (process.getuid?.() === 0) {
    t.skip('root bypasses directory permissions')
    return
  }
  const root = fixture()
  const fake = setup(root)
  const changesDir = join(root, 'openspec', 'changes')
  chmodSync(changesDir, 0o500)
  try {
    await assert.rejects(call(fake, 'openspec_new_change', { name: 'blocked-change' }))
  } finally {
    chmodSync(changesDir, 0o700)
  }
  assert.equal(existsSync(join(changesDir, 'blocked-change')), false)
})

const PLUGIN_SKILLS = [
  'openspec-explore',
  'openspec-propose',
  'openspec-apply-change',
  'openspec-archive-change',
  'openspec-update-change',
]

test('initializes an empty project without writing skills', async () => {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-init-'))
  created.push(root)
  const fake = setup(root)

  const result = await call(fake, 'openspec_init', {})
  assert.equal(result.root, root)
  assert.equal(result.config, 'created')
  assert.ok(existsSync(join(root, 'openspec', 'config.yaml')))
  assert.ok(existsSync(join(root, 'openspec', 'specs')))
  assert.equal(existsSync(join(root, '.dsh', 'skills')), false)

  const again = await call(fake, 'openspec_init', {})
  assert.equal(again.config, 'exists')
  assert.equal(existsSync(join(root, '.dsh', 'skills')), false)
})

test('the management block keeps three tools out of a gated session', () => {
  clearCache()
  const fake = createFakeContext({ cwd: process.cwd(), commands: true })
  apply(fake.ctx, { timeoutMs: 30_000 })
  const { agent, steered } = fake.createAgent()
  const visible = () => [...fake.tools.keys()].filter((name) => {
    const options = fake.toolOptions.get(name)
    return options?.when === undefined || options.when({ agent })
  })
  const management = ['openspec_init', 'openspec_schemas', 'openspec_store_list']

  assert.deepEqual(visible().sort(), TOOL_NAMES.filter((name) => !management.includes(name)).sort())

  const opened = fake.commands[0].handler({ agent, rawInput: 'list the registered stores' })
  assert.equal(opened.kind, 'success')
  assert.equal(steered.length, 1)
  assert.equal(visible().length, TOOL_NAMES.length)

  resetAdminState()
})
