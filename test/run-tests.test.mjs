import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { buildRunnerArgv } from '../scripts/coverage.mjs'
import { buildTestArgs, DEFAULT_CONCURRENCY } from '../scripts/run-tests.mjs'

test('a plain run carries exactly the default concurrency', () => {
  const args = buildTestArgs({ scope: 'plugin' })
  const flags = args.filter((argument) => argument.startsWith('--test-concurrency='))
  assert.equal(DEFAULT_CONCURRENCY, 8)
  assert.deepEqual(flags, [`--test-concurrency=${DEFAULT_CONCURRENCY}`])
  const flagIndex = args.indexOf(flags[0])
  const firstFile = args.findIndex((argument) => argument.startsWith('test/'))
  assert.ok(firstFile > flagIndex, 'the concurrency flag precedes the test files')
})

test('a passthrough override replaces the default', () => {
  const args = buildTestArgs({ scope: 'plugin', extra: ['--test-concurrency=2'] })
  const flags = args.filter((argument) => argument.startsWith('--test-concurrency='))
  assert.deepEqual(flags, ['--test-concurrency=2'])
})

test('coverage keeps one concurrency flag', () => {
  const args = buildTestArgs({ scope: 'plugin', coverage: true })
  assert.ok(args.includes('--experimental-test-coverage'))
  assert.equal(args.filter((argument) => argument.startsWith('--test-concurrency=')).length, 1)
})

test('the coverage entrypoint forwards the same concurrency', () => {
  const root = process.cwd()
  const args = buildRunnerArgv(root)
  assert.deepEqual(args, [
    join(root, 'scripts', 'run-tests.mjs'),
    'all',
    '--',
    `--test-concurrency=${DEFAULT_CONCURRENCY}`,
  ])
})
