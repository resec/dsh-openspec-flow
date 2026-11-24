import test from 'node:test'
import assert from 'node:assert/strict'
import { keepIsValueFor, main, parseCommand, parseOptions } from '../scripts/lab/cli.mjs'

test('the CLI parser keeps flags and positional arguments separate', () => {
  const { flags, positional } = parseOptions(['--name', 'poc', '--mock-only', '--', 'a task'])
  assert.equal(flags.name, 'poc')
  assert.equal(flags['mock-only'], true)
  assert.deepEqual(positional, ['a task'])
})

test('a boolean switch never takes the value after it', () => {
  const parsed = parseOptions(['--offline', 'test/lab/install-smoke.scenario.mjs'])
  assert.equal(parsed.flags.offline, true)
  assert.deepEqual(parsed.positional, ['test/lab/install-smoke.scenario.mjs'])
  for (const name of ['fresh-dsh', 'mock-only', 'include-real-model', 'cleanup', 'all']) {
    const { flags, positional } = parseOptions([`--${name}`, 'a', `--${name}`])
    assert.equal(flags[name], true, name)
    assert.deepEqual(positional, ['a'], name)
  }
  const unknown = parseOptions(['--not-a-flag', 'run'])
  assert.equal(unknown.flags['not-a-flag'], true)
  assert.deepEqual(unknown.positional, ['run'])
})

test('value flags still consume the token after them', () => {
  const { flags, positional } = parseOptions(['--name', 'poc', '--mode', 'headless', '--offline', '--', 'a task'])
  assert.deepEqual(flags, { name: 'poc', mode: 'headless', offline: true })
  assert.deepEqual(positional, ['a task'])
})

test('only cache prune reads --keep as a value', () => {
  assert.equal(keepIsValueFor('cache', 'prune'), true)
  assert.equal(keepIsValueFor('cache', 'list'), false)
  assert.equal(keepIsValueFor('cache', undefined), false)
  assert.equal(keepIsValueFor('test', 'prune'), false)
  const valued = parseCommand(['cache', 'prune', '--keep', 'a,b'])
  assert.equal(valued.flags.keep, 'a,b')
  assert.deepEqual(valued.positional, ['prune'])
  const listed = parseCommand(['cache', 'list', '--keep', 'a'])
  assert.equal(listed.flags.keep, true)
  assert.deepEqual(listed.positional, ['list', 'a'])
  const tested = parseCommand(['test', '--keep', 'a'])
  assert.equal(tested.flags.keep, true)
  assert.deepEqual(tested.positional, ['a'])
  const defaulted = parseOptions(['run', '--keep', 'a'])
  assert.equal(defaulted.flags.keep, true)
  assert.deepEqual(defaulted.positional, ['run', 'a'])
})

test('the CLI help exits successfully', async () => {
  assert.equal(await main(['--help']), 0)
})

test('an unknown command is rejected', async () => {
  await assert.rejects(main(['nope']), /unknown command/)
})
