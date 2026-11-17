import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../scripts/lab/core/paths.mjs'
import { ensureDsh } from '../scripts/lab/core/cache.mjs'

test('fresh and offline cannot be combined', async () => {
  const run = mkdtempSync(join(ROOT, '.cache', 'lab', 'test-mode-'))
  try {
    await assert.rejects(
      ensureDsh({ version: '0.0.0-missing', fresh: true, offline: true, runDirectory: run }),
      /cannot be combined/,
    )
  } finally {
    rmSync(run, { recursive: true, force: true })
  }
})

test('offline without a cache entry fails without installing', async () => {
  const run = mkdtempSync(join(ROOT, '.cache', 'lab', 'test-mode-'))
  try {
    await assert.rejects(
      ensureDsh({ version: '0.0.0-missing', offline: true, runDirectory: run }),
      /offline mode has no verified DSH cache entry/,
    )
  } finally {
    rmSync(run, { recursive: true, force: true })
  }
})
