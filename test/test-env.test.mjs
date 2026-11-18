import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { COMPILE_CACHE, testEnvFor } from '../scripts/test-env.mjs'

function scratch(t) {
  const base = mkdtempSync(join(tmpdir(), 'test-env-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  return base
}

test('a symlinked TMPDIR is resolved to its canonical path', (t) => {
  const base = scratch(t)
  const real = join(base, 'real')
  const link = join(base, 'link')
  mkdirSync(real)
  symlinkSync(real, link, 'dir')
  const env = { ...process.env, TMPDIR: link }
  assert.equal(testEnvFor(false, env).TMPDIR, realpathSync.native(real))
  assert.equal(testEnvFor(true, env).TMPDIR, realpathSync.native(real))
})

test('an already canonical TMPDIR is passed through unchanged', (t) => {
  const canonical = realpathSync.native(mkdtempSync(join(tmpdir(), 'test-env-canonical-')))
  t.after(() => rmSync(canonical, { recursive: true, force: true }))
  const env = { ...process.env, TMPDIR: canonical }
  assert.equal(testEnvFor(false, env).TMPDIR, canonical)
})

test('an unresolvable TMPDIR keeps the inherited value', () => {
  const missing = join(tmpdir(), 'test-env-missing-dir')
  const env = { ...process.env, TMPDIR: missing }
  assert.equal(testEnvFor(false, env).TMPDIR, missing)
  assert.equal(testEnvFor(true, env).TMPDIR, missing)
})

test('the compile-cache split stays unchanged', () => {
  assert.equal(COMPILE_CACHE, join(process.cwd(), '.cache', 'node-compile'))
  assert.equal(testEnvFor(false).NODE_COMPILE_CACHE, COMPILE_CACHE)
  assert.equal(testEnvFor(true).NODE_COMPILE_CACHE, undefined)
})
