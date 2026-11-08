import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  checkConsumed,
  diffShapes,
  mergeShapes,
  parseArgs,
  parseCommandOutput,
  readContract,
  resolveField,
  shapeOf,
} from '../scripts/check-cli-contract.mjs'

test('shapeOf records sorted object keys, array item shapes and scalars', () => {
  assert.deepEqual(shapeOf({ b: 'x', a: [1, 'two'], empty: [], nil: null }), {
    type: 'object',
    keys: {
      a: { type: 'array', items: { type: 'mixed', types: ['number', 'string'] } },
      b: { type: 'string' },
      empty: { type: 'array', items: null },
      nil: { type: 'null' },
    },
  })
  assert.deepEqual(shapeOf([]), { type: 'array', items: null })
  assert.deepEqual(shapeOf(true), { type: 'boolean' })
})

test('mergeShapes merges object keys and array item shapes', () => {
  assert.deepEqual(mergeShapes(shapeOf({ a: 1, b: 'x' }), shapeOf({ b: 2, c: true })), {
    type: 'object',
    keys: {
      a: { type: 'number' },
      b: { type: 'mixed', types: ['number', 'string'] },
      c: { type: 'boolean' },
    },
  })
  assert.deepEqual(mergeShapes(shapeOf([{ a: 1 }]), shapeOf([{ b: 2 }])), {
    type: 'array',
    items: {
      type: 'object',
      keys: { a: { type: 'number' }, b: { type: 'number' } },
    },
  })
})

test('mergeShapes reports a scalar type conflict as mixed', () => {
  assert.deepEqual(mergeShapes(shapeOf('x'), shapeOf(1)), {
    type: 'mixed',
    types: ['number', 'string'],
  })
})

test('diffShapes reports added, removed and type-changed paths', () => {
  assert.deepEqual(diffShapes(shapeOf({ a: 1, b: 'x' }), shapeOf({ a: '1', c: true })), [
    { path: '$.a', kind: 'type-changed', from: 'number', to: 'string' },
    { path: '$.b', kind: 'removed' },
    { path: '$.c', kind: 'added' },
  ])
})

test('diffShapes descends into array item shapes', () => {
  assert.deepEqual(
    diffShapes(
      shapeOf({ items: [{ name: 'a', count: 1 }] }),
      shapeOf({ items: [{ name: 'a' }] }),
    ),
    [{ path: '$.items[].count', kind: 'removed' }],
  )
})

test('resolveField walks object keys and array elements', () => {
  const shape = shapeOf({ changes: [{ name: 'x', totalTasks: 1 }], tags: ['a'] })
  assert.deepEqual(resolveField(shape, 'changes[].name'), { shape: { type: 'string' } })
  assert.deepEqual(resolveField(shape, 'tags[]'), { shape: { type: 'string' } })
  assert.deepEqual(resolveField(shape, 'changes'), {
    shape: {
      type: 'array',
      items: {
        type: 'object',
        keys: { name: { type: 'string' }, totalTasks: { type: 'number' } },
      },
    },
  })
})

test('resolveField walks a top-level array', () => {
  assert.deepEqual(resolveField(shapeOf([{ name: 'a', source: 'package' }]), '[].name'), {
    shape: { type: 'string' },
  })
})

test('resolveField reports a missing key and an unobserved empty array', () => {
  assert.deepEqual(resolveField(shapeOf({ a: {} }), 'a.b'), { missing: true })
  assert.deepEqual(resolveField(shapeOf({ items: [] }), 'items[].name'), {
    missing: true,
    unobserved: true,
  })
  assert.deepEqual(resolveField(shapeOf({ items: [] }), 'items'), {
    shape: { type: 'array', items: null },
  })
})

test('checkConsumed passes known fields and reports a missing field', () => {
  const shape = shapeOf({ name: 'x', count: 1, tags: ['a'] })
  assert.deepEqual(
    checkConsumed(shape, {
      name: 'string',
      count: 'number',
      tags: 'array',
      'tags[]': 'string',
      missing: 'string',
    }),
    {
      missing: [{ path: 'missing', expected: 'string' }],
      typeChanged: [],
      unobserved: [],
    },
  )
})

test('checkConsumed reports a type change', () => {
  assert.deepEqual(checkConsumed(shapeOf({ count: '1' }), { count: 'number' }), {
    missing: [],
    typeChanged: [{ path: 'count', expected: 'number', actual: 'string' }],
    unobserved: [],
  })
})

test('checkConsumed skips optional fields and warns on an unobserved array', () => {
  assert.deepEqual(
    checkConsumed(shapeOf({ items: [] }), {
      absent: { type: 'string', optional: true },
      'items[].name': 'string',
    }),
    {
      missing: [],
      typeChanged: [],
      unobserved: [{ path: 'items[].name', expected: 'string' }],
    },
  )
})

test('parseCommandOutput separates JSON from prose and empty output', () => {
  assert.deepEqual(parseCommandOutput({ stdout: '{"ok":true}\n', exitCode: 0 }), { json: { ok: true } })
  assert.deepEqual(parseCommandOutput({ stdout: 'not json', exitCode: 0 }), { error: 'output is not JSON' })
  assert.deepEqual(parseCommandOutput({ stdout: '  ', exitCode: 0 }), { error: 'no output' })
  assert.deepEqual(parseCommandOutput({}), { error: 'no output' })
})

test('parseArgs accepts candidate sources and flags', () => {
  assert.deepEqual(parseArgs([]), {
    help: false,
    json: false,
    candidate: undefined,
    candidateBin: undefined,
    baselineBin: undefined,
  })
  assert.equal(parseArgs(['--candidate', '1.16.1']).candidate, '1.16.1')
  assert.equal(parseArgs(['--candidate=1.16.1']).candidate, '1.16.1')
  assert.deepEqual(
    parseArgs(['--candidate-bin', '/tmp/cli.js', '--baseline-bin', '/tmp/base.js', '--json']),
    {
      help: false,
      json: true,
      candidate: undefined,
      candidateBin: '/tmp/cli.js',
      baselineBin: '/tmp/base.js',
    },
  )
  assert.equal(parseArgs(['-h']).help, true)
})

test('parseArgs rejects unknown options, missing values and conflicting candidates', () => {
  assert.throws(() => parseArgs(['--bogus']), /unknown option '--bogus'/)
  assert.throws(() => parseArgs(['--candidate']), /option '--candidate' needs a value/)
  assert.throws(
    () => parseArgs(['--candidate', '1.16.1', '--candidate-bin', '/tmp/cli.js']),
    /use either --candidate or --candidate-bin/,
  )
})

test('readContract loads the shipped command inventory', () => {
  const contract = readContract()
  assert.equal(contract.version, 1)
  assert.equal(contract.commands.length, 19)
  const ids = contract.commands.map((command) => command.id)
  for (const id of ['init', 'new-change', 'version', 'list', 'status', 'instructions-apply', 'archive']) {
    assert.ok(ids.includes(id), `contract lists ${id}`)
  }
  for (const command of contract.commands) {
    assert.ok(Array.isArray(command.args))
    assert.equal(typeof command.fields, 'object')
  }
})

test('readContract rejects malformed contracts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cli-contract-test-'))
  try {
    const missingCommands = join(directory, 'missing.json')
    writeFileSync(missingCommands, '{}')
    assert.throws(() => readContract(missingCommands), /no commands array/)

    const repeated = join(directory, 'repeated.json')
    writeFileSync(repeated, JSON.stringify({
      commands: [
        { id: 'x', args: [], fields: {} },
        { id: 'x', args: [], fields: {} },
      ],
    }))
    assert.throws(() => readContract(repeated), /repeats command 'x'/)

    const noArgs = join(directory, 'no-args.json')
    writeFileSync(noArgs, JSON.stringify({ commands: [{ id: 'x', fields: {} }] }))
    assert.throws(() => readContract(noArgs), /has no args array/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
