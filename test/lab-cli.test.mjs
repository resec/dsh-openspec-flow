import test from 'node:test'
import assert from 'node:assert/strict'
import { main, parseOptions } from '../scripts/lab/cli.mjs'

test('the CLI parser keeps flags and positional arguments separate', () => {
  const { flags, positional } = parseOptions(['--name', 'poc', '--mock-only', '--', 'a task'])
  assert.equal(flags.name, 'poc')
  assert.equal(flags['mock-only'], true)
  assert.deepEqual(positional, ['a task'])
})

test('the CLI help exits successfully', async () => {
  assert.equal(await main(['--help']), 0)
})

test('an unknown command is rejected', async () => {
  await assert.rejects(main(['nope']), /unknown command/)
})
