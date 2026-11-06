import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { parseArgs, resolveConfig } from '../lib/config.mjs'

function pluginRoot(t) {
  const directory = mkdtempSync(join(tmpdir(), 'eval-config-plugin-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  writeFileSync(
    join(directory, 'package.json'),
    `${JSON.stringify({ name: 'dsh-openspec-flow', version: '0.1.0' })}\n`,
  )
  return directory
}

test('defaults to one worker', () => {
  const config = resolveConfig(parseArgs([]))
  assert.equal(config.concurrency, 1)
  assert.equal(config.keepHome, false)
})

test('resolves the single-repository plugin root by default', () => {
  const config = resolveConfig(parseArgs([]))

  assert.equal(typeof config.pluginRoot, 'string')
  assert.equal(existsSync(join(config.pluginRoot, 'package.json')), true)
  assert.equal(typeof config.pluginSource, 'string')
  assert.equal(config.clone, null)
})

test('accepts an explicit plugin root', (t) => {
  const root = pluginRoot(t)
  const config = resolveConfig(parseArgs(['--plugin-root', root]))

  assert.equal(config.pluginRoot, root)
  assert.equal(config.pluginSource, 'flag')
})

test('falls back to a clone when no local root resolves', () => {
  const failing = () => {
    throw new Error('no local plugin root')
  }
  const config = resolveConfig(parseArgs(['--clone', '--plugin-ref', 'v1.2.3']), {
    resolvePlugin: failing,
  })

  assert.equal(config.pluginRoot, null)
  assert.equal(config.pluginSource, 'clone')
  assert.equal(config.clone.ref, 'v1.2.3')
  assert.match(config.clone.url, /dsh-openspec-flow\.git$/u)
  assert.match(config.clone.destination, /\.plugin$/u)
})

test('propagates a resolution failure without --clone', () => {
  const failing = () => {
    throw new Error('no local plugin root')
  }

  assert.throws(
    () => resolveConfig(parseArgs([]), { resolvePlugin: failing }),
    /no local plugin root/u,
  )
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
    '--plugin-root', '/plugin', '--clone', '--plugin-ref', 'v1',
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
  assert.equal(options.pluginRoot, '/plugin')
  assert.equal(options.clone, true)
  assert.equal(options.pluginRef, 'v1')
  assert.equal(options.keepHome, true)
})

test('rejects missing values and unknown options', () => {
  assert.throws(() => parseArgs(['--out']), /requires a value/)
  assert.throws(() => parseArgs(['--out', '--execute']), /requires a value/)
  assert.throws(() => parseArgs(['--unknown']), /unknown option/)
  assert.throws(() => parseArgs(['--runs', 'zero']), /positive integer/)
  assert.throws(() => parseArgs(['--plugin-root']), /requires a value/)
  assert.throws(() => parseArgs(['--plugin-ref']), /requires a value/)
  assert.throws(() => resolveConfig(parseArgs(['--fixture', 'missing'])), /unknown fixture/)
  assert.throws(() => resolveConfig(parseArgs(['--arms', 'other'])), /unknown arm/)
})
