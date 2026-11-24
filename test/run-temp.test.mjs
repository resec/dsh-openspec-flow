import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, sep } from 'node:path'
import test from 'node:test'
import { createRunTempDir, removeRunTempDir } from '../scripts/test-env.mjs'

/** Create a scratch base directory that the test removes afterwards. */
function scratch(t) {
  const base = mkdtempSync(join(tmpdir(), 'test-env-run-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  return base
}

test('a run root is created under the canonical temporary base', (t) => {
  const base = scratch(t)
  const root = createRunTempDir({ ...process.env, TMPDIR: base })
  t.after(() => removeRunTempDir(root))
  assert.notEqual(root, undefined)
  assert.ok(root.startsWith(`${realpathSync.native(base)}${sep}`))
  assert.match(basename(root), /^openspec-flow-run-/)
  assert.ok(existsSync(root))
})

test('two runs get distinct roots', (t) => {
  const base = scratch(t)
  const first = createRunTempDir({ ...process.env, TMPDIR: base })
  const second = createRunTempDir({ ...process.env, TMPDIR: base })
  t.after(() => removeRunTempDir(first))
  t.after(() => removeRunTempDir(second))
  assert.notEqual(first, second)
  assert.ok(existsSync(first))
  assert.ok(existsSync(second))
})

test('the default base is the host temporary directory', (t) => {
  const root = createRunTempDir()
  t.after(() => removeRunTempDir(root))
  assert.notEqual(root, undefined)
  assert.ok(root.startsWith(`${realpathSync.native(tmpdir())}${sep}`))
})

test('removal deletes the root and everything beneath it', (t) => {
  const base = scratch(t)
  const root = createRunTempDir({ ...process.env, TMPDIR: base })
  assert.notEqual(root, undefined)
  mkdirSync(join(root, 'nested', 'deeper'), { recursive: true })
  writeFileSync(join(root, 'nested', 'deeper', 'file.txt'), 'content\n')
  removeRunTempDir(root)
  assert.equal(existsSync(root), false)
})

test('removing a missing root or no root is a no-op', (t) => {
  const base = scratch(t)
  assert.doesNotThrow(() => removeRunTempDir(join(base, 'missing')))
  assert.doesNotThrow(() => removeRunTempDir(undefined))
})

test('an unresolvable base yields no run root', (t) => {
  const base = scratch(t)
  const root = createRunTempDir({ ...process.env, TMPDIR: join(base, 'missing') })
  assert.equal(root, undefined)
})
