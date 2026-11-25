import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_BACKOFF_MS,
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_MAX_BUFFER_BYTES,
  DEFAULT_POLL_TIMEOUT_MS,
  DEFAULT_PROBE_ATTEMPTS,
  DEFAULT_PROBE_TIMEOUT_MS,
  DEFAULT_READ_ATTEMPTS,
  DEFAULT_TIMEOUT_MS,
  GhDeadlineError,
  fetchBase,
  ghCounters,
  ghProbe,
  ghRead,
  ghWrite,
  resetGhCounters,
  resolveGhConfig,
  spawnGh,
} from '../scripts/gh-exec.mjs'
import { isTransientGhFailure } from '../scripts/gh-retry.mjs'

/** A spawnSync result for a command killed by its deadline. */
function deadlineResult() {
  return {
    status: null,
    signal: 'SIGTERM',
    stdout: '',
    stderr: '',
    error: Object.assign(new Error('spawnSync gh ETIMEDOUT'), { code: 'ETIMEDOUT' }),
  }
}

/** A spawnSync result for a successful command. */
function successResult(stdout = 'ok\n') {
  return { status: 0, signal: null, stdout, stderr: '' }
}

/** A spawnSync result for a failed command. */
function failureResult(stderr = 'boom\n') {
  return { status: 1, signal: null, stdout: '', stderr }
}

/** A spawn function returning the given results in order, recording calls. */
function fakeSpawn(...results) {
  const calls = []
  const spawn = (command, args, options) => {
    calls.push({ command, args, options })
    const index = Math.min(calls.length - 1, results.length - 1)
    const entry = results[index]
    return typeof entry === 'function' ? entry() : entry
  }
  return { spawn, calls }
}

/** A config with inert numbers for tests that do not exercise environment values. */
function testConfig(overrides = {}) {
  return {
    timeoutMs: 20_000,
    attempts: 3,
    backoffMs: [1_000, 3_000],
    pollTimeoutMs: 5_000,
    probeTimeoutMs: 5_000,
    fetchTimeoutMs: 30_000,
    ...overrides,
  }
}

test('the documented defaults are the designed values', () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 20_000)
  assert.equal(DEFAULT_READ_ATTEMPTS, 3)
  assert.deepEqual(DEFAULT_BACKOFF_MS, [1_000, 3_000])
  assert.equal(DEFAULT_POLL_TIMEOUT_MS, 5_000)
  assert.equal(DEFAULT_PROBE_TIMEOUT_MS, 5_000)
  assert.equal(DEFAULT_PROBE_ATTEMPTS, 2)
  assert.equal(DEFAULT_FETCH_TIMEOUT_MS, 30_000)
  assert.equal(DEFAULT_MAX_BUFFER_BYTES, 32 * 1024 * 1024)
  assert.deepEqual(resolveGhConfig({}), testConfig())
})

test('an in-range override replaces its default', () => {
  const config = resolveGhConfig({
    PR_REVIEW_GH_TIMEOUT_MS: '15000',
    PR_REVIEW_GH_ATTEMPTS: '4',
    PR_REVIEW_GH_BACKOFF_MS: '500,2500',
    PR_REVIEW_GH_POLL_TIMEOUT_MS: '2000',
    PR_REVIEW_GH_PROBE_TIMEOUT_MS: '3000',
    PR_REVIEW_GH_FETCH_TIMEOUT_MS: '60000',
  })
  assert.deepEqual(config, {
    timeoutMs: 15_000,
    attempts: 4,
    backoffMs: [500, 2_500],
    pollTimeoutMs: 2_000,
    probeTimeoutMs: 3_000,
    fetchTimeoutMs: 60_000,
  })
})

test('an out-of-range override is ignored and the documented default applies', () => {
  const config = resolveGhConfig({
    PR_REVIEW_GH_TIMEOUT_MS: '500',
    PR_REVIEW_GH_ATTEMPTS: '0',
    PR_REVIEW_GH_BACKOFF_MS: '1000,999999',
    PR_REVIEW_GH_POLL_TIMEOUT_MS: '999999',
    PR_REVIEW_GH_PROBE_TIMEOUT_MS: '0',
    PR_REVIEW_GH_FETCH_TIMEOUT_MS: 'nope',
  })
  assert.deepEqual(config, testConfig())
})

test('spawnGh runs gh under the deadline and a raised buffer', () => {
  const { spawn, calls } = fakeSpawn(successResult('text\n'))
  const value = spawnGh(['pr', 'list'], { spawn, config: testConfig() })
  assert.equal(value.status, 0)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, 'gh')
  assert.deepEqual(calls[0].args, ['pr', 'list'])
  assert.equal(calls[0].options.timeout, 20_000)
  assert.equal(calls[0].options.maxBuffer, DEFAULT_MAX_BUFFER_BYTES)
  assert.ok(calls[0].options.maxBuffer > 1024 * 1024)
})

test('a deadline kill is a transient error naming the command and deadline', () => {
  resetGhCounters()
  const { spawn } = fakeSpawn(deadlineResult())
  assert.throws(
    () => spawnGh(['pr', 'view', '7'], { spawn, config: testConfig({ timeoutMs: 1234 }) }),
    (error) => {
      assert.ok(error instanceof GhDeadlineError)
      assert.match(error.message, /gh pr view 7/)
      assert.match(error.message, /1234/)
      assert.equal(isTransientGhFailure(error), true)
      return true
    },
  )
  assert.equal(ghCounters().calls, 1)
  assert.equal(ghCounters().transientFailures, 1)
})

test('ghRead retries a deadline kill under the three-attempt policy', () => {
  resetGhCounters()
  const { spawn, calls } = fakeSpawn(deadlineResult(), deadlineResult(), successResult('rows\n'))
  const sleeps = []
  const value = ghRead(['pr', 'list'], {
    spawn,
    config: testConfig(),
    sleep: (milliseconds) => sleeps.push(milliseconds),
  })
  assert.equal(value, 'rows')
  assert.equal(calls.length, 3)
  assert.deepEqual(sleeps, [1_000, 3_000])
  assert.equal(ghCounters().calls, 3)
})

test('ghRead gives up after three attempts', () => {
  const { spawn, calls } = fakeSpawn(deadlineResult())
  assert.throws(
    () => ghRead(['pr', 'list'], { spawn, config: testConfig(), sleep: () => {} }),
    /timed out after 20000 ms/u,
  )
  assert.equal(calls.length, 3)
})

test('ghRead does not retry a non-transient failure', () => {
  const { spawn, calls } = fakeSpawn(failureResult('HTTP 403: forbidden'))
  assert.throws(
    () => ghRead(['pr', 'list'], { spawn, config: testConfig(), sleep: () => {} }),
    /HTTP 403/u,
  )
  assert.equal(calls.length, 1)
})

test('ghRead returns undefined on an allowed non-zero exit', () => {
  const { spawn } = fakeSpawn(failureResult('missing'))
  assert.equal(
    ghRead(['repo', 'view'], { spawn, config: testConfig(), allowFailure: true }),
    undefined,
  )
})

test('ghWrite stays single-shot under the deadline', () => {
  const { spawn, calls } = fakeSpawn(deadlineResult())
  assert.throws(
    () => ghWrite(['pr', 'merge', '7'], { spawn, config: testConfig(), sleep: () => {} }),
    GhDeadlineError,
  )
  assert.equal(calls.length, 1)
})

test('ghProbe uses two attempts under the probe deadline', () => {
  const { spawn, calls } = fakeSpawn(deadlineResult())
  assert.throws(
    () => ghProbe(['api', 'user'], { spawn, config: testConfig({ probeTimeoutMs: 4_000 }), sleep: () => {} }),
    GhDeadlineError,
  )
  assert.equal(calls.length, 2)
  assert.equal(calls[0].options.timeout, 4_000)
  assert.equal(calls[1].options.timeout, 4_000)
})

test('fetchBase bounds the base fetch and reports a failed fetch', () => {
  const ok = fakeSpawn(successResult())
  assert.equal(fetchBase('/repo', { spawn: ok.spawn, config: testConfig() }), true)
  assert.deepEqual(ok.calls[0].args, ['-C', '/repo', 'fetch', 'origin', 'main'])
  assert.equal(ok.calls[0].options.timeout, 30_000)

  const stalled = fakeSpawn(deadlineResult())
  assert.equal(fetchBase('/repo', { spawn: stalled.spawn, config: testConfig() }), false)
})

test('allowFailure hides a command exit but not a spawn-level failure', () => {
  const failed = fakeSpawn(failureResult('HTTP 404: Not Found'))
  assert.equal(
    ghRead(['pr', 'view', '7'], { spawn: failed.spawn, config: testConfig(), allowFailure: true }),
    undefined,
  )
  const denied = fakeSpawn({
    status: null,
    signal: null,
    stdout: '',
    stderr: '',
    error: Object.assign(new Error('spawnSync gh EACCES'), { code: 'EACCES' }),
  })
  assert.throws(
    () => ghRead(['pr', 'view', '7'], { spawn: denied.spawn, config: testConfig(), allowFailure: true }),
    /EACCES/u,
  )
})
