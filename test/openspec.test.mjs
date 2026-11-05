import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { assertCliVersion, PINNED_CLI_VERSION, resolveBundledCli } from '../lib/openspec.js'

const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))

test('pins an exact bundled CLI version', () => {
  assert.equal(PINNED_CLI_VERSION, '1.16.0')
  assert.match(PINNED_CLI_VERSION, /^\d+\.\d+\.\d+$/)
  assert.equal(manifest.dependencies['@fission-ai/openspec'], PINNED_CLI_VERSION)
  assert.equal(manifest.devDependencies?.['@fission-ai/openspec'], undefined)
})

test('resolves the bin from the plugin installation tree', () => {
  const bin = resolveBundledCli()
  assert.ok(existsSync(bin), `bundled bin exists: ${bin}`)
  assert.match(bin, /node_modules[\\/]@fission-ai[\\/]openspec[\\/]bin[\\/]openspec\.js$/u)
  assert.equal(resolveBundledCli(), bin)
  assert.equal(
    bin,
    join(fileURLToPath(new URL('../node_modules/@fission-ai/openspec', import.meta.url)), 'bin', 'openspec.js'),
  )
})

test('accepts the pinned version and JSON envelope', () => {
  assert.doesNotThrow(() => assertCliVersion({ version: PINNED_CLI_VERSION, schemaVersion: 1 }))
})

test('rejects a mismatched CLI version or schema envelope', () => {
  assert.throws(
    () => assertCliVersion({ version: '1.15.0', schemaVersion: 1 }),
    /reports version '1\.15\.0'.*pins '1\.16\.0'/s,
  )
  assert.throws(
    () => assertCliVersion({ version: PINNED_CLI_VERSION, schemaVersion: 2 }),
    /schemaVersion '2'.*expects 1/,
  )
  assert.throws(() => assertCliVersion(null), /non-object version report/)
})
