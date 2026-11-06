import assert from 'node:assert/strict'
import test from 'node:test'
import { parseArgs, resolveConfig } from '../lib/config.mjs'

test('defaults to one worker', () => {
  const config = resolveConfig(parseArgs([]))
  assert.equal(config.concurrency, 1)
  assert.equal(config.keepHome, false)
})

test('accepts a concurrency and keep-home flag', () => {
  const config = resolveConfig(parseArgs(['--concurrency', '3', '--keep-home']))
  assert.equal(config.concurrency, 3)
  assert.equal(config.keepHome, true)
})

test('rejects a non-positive concurrency', () => {
  assert.throws(() => parseArgs(['--concurrency', '0']), /positive integer/u)
})
