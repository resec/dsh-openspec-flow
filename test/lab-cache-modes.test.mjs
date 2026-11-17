import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureDsh, withLock } from '../scripts/lab/core/cache.mjs'

test('fresh and offline cannot be combined', async () => {
  const run = mkdtempSync(join(tmpdir(), 'dsh-lab-mode-'))
  try {
    await assert.rejects(
      ensureDsh({ version: '0.0.0-missing', fresh: true, offline: true, runDirectory: run }),
      /cannot be combined/,
    )
  } finally {
    rmSync(run, { recursive: true, force: true })
  }
})

test('a stale lock left by a dead process is reclaimed', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-lab-lock-'))
  const lock = join(root, 'lock')
  mkdirSync(lock)
  writeFileSync(join(lock, 'pid'), '999999\n')
  try {
    const value = await withLock(lock, async () => 'ok', 2_000)
    assert.equal(value, 'ok')
    assert.equal(existsSync(lock), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('offline without a cache entry fails without installing', async () => {
  const run = mkdtempSync(join(tmpdir(), 'dsh-lab-mode-'))
  try {
    await assert.rejects(
      ensureDsh({ version: '0.0.0-missing', offline: true, runDirectory: run }),
      /offline mode has no verified DSH cache entry/,
    )
  } finally {
    rmSync(run, { recursive: true, force: true })
  }
})
