import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'
import { openspecBin } from '../lib/paths.mjs'

test('reports a missing CLI dependency', () => {
  assert.throws(
    () =>
      openspecBin({
        resolveEntry: () => {
          throw new Error('missing')
        },
      }),
    /OpenSpec CLI is not installed/u,
  )
})

test('reports a missing CLI entry', () => {
  assert.throws(
    () => openspecBin({ resolveEntry: () => '/tmp/pkg/dist/index.js', exists: () => false }),
    /OpenSpec CLI entry is missing/u,
  )
})

test('resolves the installed CLI and caches it', () => {
  const binary = openspecBin()

  assert.equal(existsSync(binary), true)
  assert.match(binary, /bin[\\/]openspec\.js$/u)
  assert.equal(
    openspecBin({
      resolveEntry: () => {
        throw new Error('must not run after a cache hit')
      },
    }),
    binary,
  )
})
