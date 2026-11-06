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

test('parses every supported option', () => {
  const options = parseArgs([
    '--help', '-h', '--list', '--execute',
    '--fixture', 'synthetic', '--fixture', 'policy-rule',
    '--arms', 'official, plugin,',
    '--runs', '2', '--out', '/out',
    '--timeout-min', '5', '--budget', '10',
    '--home', '/home', '--agents-home', '/agents', '--source-home', '/source',
    '--keep-home',
  ])
  assert.equal(options.help, true)
  assert.equal(options.list, true)
  assert.equal(options.execute, true)
  assert.deepEqual(options.fixtures, ['synthetic', 'policy-rule'])
  assert.deepEqual(options.arms, ['official', 'plugin'])
  assert.equal(options.runs, 2)
  assert.equal(options.out, '/out')
  assert.equal(options.timeoutMin, 5)
  assert.equal(options.budget, 10)
  assert.equal(options.home, '/home')
  assert.equal(options.agentsHome, '/agents')
  assert.equal(options.sourceHome, '/source')
  assert.equal(options.keepHome, true)
})

test('rejects missing values and unknown options', () => {
  assert.throws(() => parseArgs(['--out']), /requires a value/)
  assert.throws(() => parseArgs(['--out', '--execute']), /requires a value/)
  assert.throws(() => parseArgs(['--unknown']), /unknown option/)
  assert.throws(() => parseArgs(['--runs', 'zero']), /positive integer/)
  assert.throws(() => resolveConfig(parseArgs(['--fixture', 'missing'])), /unknown fixture/)
  assert.throws(() => resolveConfig(parseArgs(['--arms', 'other'])), /unknown arm/)
})
