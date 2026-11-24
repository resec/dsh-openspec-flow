import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import test from 'node:test'
import { cleanupTempDirs, tempDir } from './temp.mjs'

test('a registered root is created with the requested prefix', (t) => {
  t.after(cleanupTempDirs)
  const directory = tempDir('dsh-temp-test-')
  assert.ok(existsSync(directory))
  assert.match(basename(directory), /^dsh-temp-test-/)
})

test('two roots are distinct', (t) => {
  t.after(cleanupTempDirs)
  const first = tempDir('dsh-temp-first-')
  const second = tempDir('dsh-temp-second-')
  assert.notEqual(first, second)
  assert.ok(existsSync(first))
  assert.ok(existsSync(second))
})

test('cleanup removes every registered root and a second call is a no-op', (t) => {
  t.after(cleanupTempDirs)
  const first = tempDir('dsh-temp-a-')
  const second = tempDir('dsh-temp-b-')
  writeFileSync(join(second, 'file.txt'), 'content\n')
  cleanupTempDirs()
  assert.equal(existsSync(first), false)
  assert.equal(existsSync(second), false)
  assert.doesNotThrow(() => cleanupTempDirs())
})

test('a root a test removed on its own is skipped by cleanup', (t) => {
  t.after(cleanupTempDirs)
  const directory = tempDir('dsh-temp-manual-')
  rmSync(directory, { recursive: true, force: true })
  assert.doesNotThrow(() => cleanupTempDirs())
})

test('an undeletable root is reported without failing cleanup', (t) => {
  const directory = tempDir('dsh-temp-perm-')
  mkdirSync(join(directory, 'child'))
  writeFileSync(join(directory, 'child', 'file.txt'), 'content\n')
  chmodSync(directory, 0o500)
  t.after(() => {
    try {
      chmodSync(directory, 0o700)
    } catch {
      // the directory may already be gone
    }
    try {
      rmSync(directory, { recursive: true, force: true })
    } catch {
      // best-effort cleanup for a directory the permission case left behind
    }
  })
  assert.doesNotThrow(() => cleanupTempDirs())
})
