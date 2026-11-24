import test from 'node:test'
import assert from 'node:assert/strict'
import { main, parseOptions } from '../scripts/lab/cli.mjs'

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

test('cache prune still reads --keep as a value', () => {
  const valued = parseOptions(['prune', '--keep', 'a,b'], { keepIsValue: true })
  assert.equal(valued.flags.keep, 'a,b')
  assert.deepEqual(valued.positional, ['prune'])
  const switched = parseOptions(['run', '--keep', 'a'])
  assert.equal(switched.flags.keep, true)
  assert.deepEqual(switched.positional, ['run', 'a'])
})

test('the CLI help exits successfully', async () => {
  assert.equal(await main(['--help']), 0)
})

test('an unknown command is rejected', async () => {
  await assert.rejects(main(['nope']), /unknown command/)
})
