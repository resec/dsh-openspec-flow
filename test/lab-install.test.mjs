import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../scripts/lab/core/paths.mjs'
import { gitDirty, gitHead, packPlugin } from '../scripts/lab/core/install.mjs'

test('the working tree can be packed without writing dist', () => {
  const out = mkdtempSync(join(ROOT, '.cache', 'lab', 'test-pack-'))
  try {
    const packed = packPlugin({ root: ROOT, outDir: out })
    assert.equal(packed.name, 'dsh-openspec-flow')
    assert.match(packed.version, /^\d+\.\d+\.\d+/)
    assert.ok(existsSync(packed.tarball))
    assert.equal(typeof packed.sha512, 'string')
    assert.ok(packed.sha512.length > 20)
    assert.equal(typeof packed.dirty.dirty, 'boolean')
    assert.match(packed.head, /^[0-9a-f]{7,40}$/)
    assert.equal(typeof gitDirty(ROOT).paths, 'object')
    assert.match(gitHead(ROOT), /^[0-9a-f]{7,40}$/)
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})
