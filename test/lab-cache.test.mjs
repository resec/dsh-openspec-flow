import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cacheKey, verifyInstall } from '../scripts/lab/core/cache.mjs'

function fixture(version = '9.9.9') {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-lab-cache-'))
  const packageDir = join(dir, 'node_modules', '@deepseek-ai', 'dsh')
  mkdirSync(join(packageDir, 'lib'), { recursive: true })
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version }))
  writeFileSync(join(packageDir, 'lib', 'bin.js'), '')
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ version }))
  writeFileSync(join(dir, '.complete'), `${version}\n`)
  return dir
}

test('a cache key includes the Node major, platform and architecture', () => {
  assert.equal(
    cacheKey({ version: '1.2.3', nodeVersion: 'v24.9.0', platform: 'linux', arch: 'x64' }),
    '1.2.3/node24-linux-x64',
  )
})

test('a complete cache entry verifies', () => {
  const dir = fixture()
  try {
    assert.equal(verifyInstall(dir, '9.9.9').ok, true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a missing marker fails verification', () => {
  const dir = fixture()
  try {
    rmSync(join(dir, '.complete'))
    const result = verifyInstall(dir, '9.9.9')
    assert.equal(result.ok, false)
    assert.match(result.reason, /complete/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a version mismatch fails verification', () => {
  const dir = fixture('1.0.0')
  try {
    assert.equal(verifyInstall(dir, '2.0.0').ok, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
