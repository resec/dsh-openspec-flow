import assert from 'node:assert/strict'
import test from 'node:test'

import { isTransientGhFailure, sleepSync, withGhRetry } from '../scripts/gh-retry.mjs'

test('the transient classifier accepts gateway failures and rejects every other failure', () => {
  assert.equal(isTransientGhFailure(new Error('gh pr list failed: HTTP 502: 502 Bad Gateway (https://api.github.com/graphql)')), true)
  assert.equal(isTransientGhFailure(new Error('HTTP 504: 504 Gateway Timeout')), true)
  assert.equal(isTransientGhFailure(new Error('HTTP 500: 500 Internal Server Error')), true)
  assert.equal(isTransientGhFailure(new Error('read ECONNRESET')), true)
  assert.equal(isTransientGhFailure(new Error('socket hang up')), true)
  assert.equal(isTransientGhFailure(new Error('the request timed out')), true)
  assert.equal(isTransientGhFailure('503 Service Unavailable'), true)
  assert.equal(isTransientGhFailure(new Error('HTTP 403: rate limit exceeded')), false)
  assert.equal(isTransientGhFailure(new Error('gh pr list failed: HTTP 404: Not Found')), false)
  assert.equal(isTransientGhFailure(new Error('spawnSync gh ENOENT')), false)
  assert.equal(isTransientGhFailure(undefined), false)
})

test('a transient failure is retried once and the retry result is returned', () => {
  let calls = 0
  const delays = []
  const value = withGhRetry(() => {
    calls += 1
    if (calls === 1) throw new Error('gh pr list failed: HTTP 502: 502 Bad Gateway')
    return 'rows'
  }, { delayMs: 25, sleep: (milliseconds) => delays.push(milliseconds) })
  assert.equal(value, 'rows')
  assert.equal(calls, 2)
  assert.deepEqual(delays, [25])
})

test('a transient failure that fails twice is rethrown without a third attempt', () => {
  let calls = 0
  assert.throws(() => withGhRetry(() => {
    calls += 1
    throw new Error('HTTP 504: 504 Gateway Timeout')
  }, { delayMs: 0, sleep: () => {} }), /HTTP 504/)
  assert.equal(calls, 2)
})

test('a non-transient failure is rethrown without a retry or a delay', () => {
  let calls = 0
  const delays = []
  assert.throws(() => withGhRetry(() => {
    calls += 1
    throw new Error('HTTP 403: rate limit exceeded')
  }, { delayMs: 2000, sleep: (milliseconds) => delays.push(milliseconds) }), /HTTP 403/)
  assert.equal(calls, 1)
  assert.deepEqual(delays, [])
})

test('an injected zero delay skips the sleep and the default delay is two seconds', () => {
  const zero = []
  withGhRetry(() => {
    if (zero.length === 0) {
      zero.push('failed')
      throw new Error('HTTP 500')
    }
    return 'ok'
  }, { delayMs: 0, sleep: (milliseconds) => assert.fail(`unexpected sleep ${milliseconds}`) })
  const defaults = []
  withGhRetry(() => {
    if (defaults.length === 0) {
      defaults.push('failed')
      throw new Error('HTTP 500')
    }
    return 'ok'
  }, { sleep: (milliseconds) => defaults.push(milliseconds) })
  assert.deepEqual(defaults, ['failed', 2000])
})

test('sleepSync waits only for a positive delay', () => {
  assert.equal(sleepSync(0), undefined)
  assert.equal(sleepSync(-5), undefined)
  assert.equal(sleepSync(1), undefined)
})

test('the attempt budget bounds the retries and uses the delay schedule', () => {
  let calls = 0
  const delays = []
  const value = withGhRetry(() => {
    calls += 1
    if (calls < 3) throw new Error('HTTP 502: 502 Bad Gateway')
    return 'rows'
  }, { attempts: 3, delays: [10, 20], sleep: (milliseconds) => delays.push(milliseconds) })
  assert.equal(value, 'rows')
  assert.equal(calls, 3)
  assert.deepEqual(delays, [10, 20])
})

test('a three-attempt read reports the failure after the third attempt', () => {
  let calls = 0
  assert.throws(() => withGhRetry(() => {
    calls += 1
    throw new Error('gh pr list timed out after 20000 ms (ETIMEDOUT)')
  }, { attempts: 3, delays: [0, 0], sleep: () => {} }), /timed out/u)
  assert.equal(calls, 3)
})

test('a single attempt never retries', () => {
  let calls = 0
  assert.throws(() => withGhRetry(() => {
    calls += 1
    throw new Error('HTTP 503: Service Unavailable')
  }, { attempts: 1, sleep: () => {} }), /HTTP 503/u)
  assert.equal(calls, 1)
})

test('a non-transient failure is not retried even with attempts left', () => {
  let calls = 0
  assert.throws(() => withGhRetry(() => {
    calls += 1
    throw new Error('HTTP 404: Not Found')
  }, { attempts: 3, delays: [0, 0], sleep: () => {} }), /HTTP 404/u)
  assert.equal(calls, 1)
})
