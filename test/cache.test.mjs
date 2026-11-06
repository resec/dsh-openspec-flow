import assert from 'node:assert/strict'
import test from 'node:test'
import { cacheKey, clearCache, readCache, writeCache } from '../lib/cache.js'

test('evicts the oldest entry beyond the in-memory limit', () => {
  clearCache()
  for (let index = 0; index < 17; index += 1) {
    writeCache(cacheKey('/project', `change-${index}`), { index })
  }
  assert.equal(readCache(cacheKey('/project', 'change-0')), undefined)
  assert.equal(readCache(cacheKey('/project', 'change-16')).index, 16)
})

test('returns undefined for a missing key', () => {
  clearCache()
  assert.equal(readCache('missing'), undefined)
})
