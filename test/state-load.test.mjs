import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadApplyState } from '../lib/state.js'

function payload(root, overrides = {}) {
  return {
    changeName: 'c',
    schemaName: 'spec-driven',
    state: 'ready',
    progress: { total: 1, complete: 0, remaining: 1 },
    root: { path: root },
    changeDir: '',
    tasks: [{ id: '1.1', description: 'one', sourcePath: join(root, 'tasks.md'), line: 1, done: false }],
    ...overrides,
  }
}

async function load(json, { cwd = '/tmp/state-load', root } = {}) {
  const run = async () => ({ json })
  return loadApplyState(null, null, cwd, 'c', undefined, undefined, run)
}

function withDataHome(root, fn) {
  const previous = process.env.XDG_DATA_HOME
  process.env.XDG_DATA_HOME = root
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previous === undefined) delete process.env.XDG_DATA_HOME
      else process.env.XDG_DATA_HOME = previous
    })
}

test('loads a payload and normalizes optional tracking fields', async () => {
  const root = mkdtempSync(join(tmpdir(), 'state-load-'))
  try {
    await withDataHome(root, async () => {
      const entry = await load(payload(root, {
        changeDir: 5,
        contextFiles: { tasks: ['a', 2, ''] },
        unavailableTrackingFiles: [{ path: 'u' }, { path: '' }, { path: 3 }, null],
        tasks: [
          null,
          42,
          { description: '' },
          { description: 42 },
          { id: '1.1', description: 'one', sourcePath: join(root, 'tasks.md'), line: 1 },
          { description: 'two', sourcePath: join(root, 'tasks.md'), line: 2 },
        ],
      }))
      assert.equal(entry.tasks.length, 2)
      assert.equal(entry.tasks[0].id, '1.1')
      assert.equal(entry.tasks[1].id, '2')
      assert.equal(entry.changeDir, '')
      assert.equal(entry.projectRoot, root)
      assert.equal(entry.schemaName, 'spec-driven')
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('derives the project root from changeDir when root is absent', async () => {
  const root = mkdtempSync(join(tmpdir(), 'state-load-'))
  try {
    await withDataHome(root, async () => {
      const changeDir = join(root, 'openspec', 'changes', 'c')
      const entry = await load(payload(root, { root: null, changeDir }))
      assert.equal(entry.projectRoot, root)
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejects a payload without a resolvable project root', async () => {
  const root = mkdtempSync(join(tmpdir(), 'state-load-'))
  try {
    await withDataHome(root, async () => {
      await assert.rejects(load(payload(root, { root: null, changeDir: '' })), /no project root/)
      await assert.rejects(load(payload(root, { root: null, changeDir: 5 })), /no project root/)
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejects payloads with missing required fields', async () => {
  const root = mkdtempSync(join(tmpdir(), 'state-load-'))
  try {
    await withDataHome(root, async () => {
      await assert.rejects(load(null), /non-object payload/)
      await assert.rejects(load([]), /non-object payload/)
      await assert.rejects(load({ status: [{ message: 'bad' }] }), /bad/)
      await assert.rejects(load({ changeName: 'c' }), /missing changeName or tasks/)
      await assert.rejects(load({ changeName: 'c', tasks: [], schemaName: undefined }), /no schemaName/)
      await assert.rejects(load({ changeName: 'c', tasks: [], schemaName: 'spec-driven', state: undefined }), /no state/)
      await assert.rejects(load({ changeName: 'c', tasks: [], schemaName: 'spec-driven', state: 'ready', progress: null }), /no progress/)
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejects a task without a usable sourcePath and line', async () => {
  const root = mkdtempSync(join(tmpdir(), 'state-load-'))
  try {
    await withDataHome(root, async () => {
      await assert.rejects(
        load(payload(root, { tasks: [{ description: 'one' }] })),
        /without a usable sourcePath and line/,
      )
      await assert.rejects(
        load(payload(root, { tasks: [{ description: 'one', sourcePath: join(root, 't.md'), line: 0 }] })),
        /without a usable sourcePath and line/,
      )
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
