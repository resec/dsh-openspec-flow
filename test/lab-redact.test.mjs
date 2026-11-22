import assert from 'node:assert/strict'
import test from 'node:test'
import { REDACTED, redactState, redactText } from '../scripts/lab/core/redact.mjs'

test('redactText keeps the location and replaces the credential', () => {
  assert.equal(
    redactText('dsh web: http://127.0.0.1:3210/?token=abc123 failed'),
    `dsh web: http://127.0.0.1:3210/?token=${REDACTED} failed`,
  )
  assert.equal(redactText('Cookie: session=abc; other=def'), `Cookie: ${REDACTED}`)
  assert.equal(redactText('token=abc123'), `token=${REDACTED}`)
  assert.equal(redactText('the profile did not initialize'), 'the profile did not initialize')
  assert.equal(redactText(''), '')
  assert.equal(redactText(undefined), undefined)
})

test('redactState drops the credential fields and keeps the diagnosis', () => {
  const state = redactState({
    runDir: '/runs/1',
    checks: [{ name: 'web', status: 'fail', detail: 'timed out: http://host/?token=abc' }],
    web: {
      base: 'http://127.0.0.1:3210',
      url: 'http://127.0.0.1:3210/?token=abc',
      cookie: 'session=abc',
      logPath: '/runs/1/web.log',
      process: { pid: 42, stop() {} },
      send: () => {},
    },
  })
  assert.deepEqual(Object.keys(state.web).sort(), ['base', 'logPath'])
  assert.equal(JSON.stringify(state).includes('abc'), false, 'no credential value survives')
  assert.match(state.checks[0].detail, /<redacted>/u)
  assert.equal(state.runDir, '/runs/1')
})

test('redactState leaves a state without a web entry alone', () => {
  const state = redactState({ runDir: '/runs/2', checks: [] })
  assert.deepEqual(state, { runDir: '/runs/2', checks: [] })
})
