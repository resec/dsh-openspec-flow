import assert from 'node:assert/strict'
import test from 'node:test'
import { REDACTED, redactMessage, redactState, redactText } from '../scripts/lab/core/redact.mjs'

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

test('redactText reads the serialized and header forms of a credential', () => {
  assert.equal(redactText('{"cookie":"session=abc","other":1}'), `{"cookie":"${REDACTED}","other":1}`)
  assert.equal(redactText('{"api_key":"sk-live-123"}'), `{"api_key":"${REDACTED}"}`)
  assert.equal(redactText('{"access_token": "t0k"}'), `{"access_token": "${REDACTED}"}`)
  assert.equal(redactText("{'cookie': 'session=abc'}"), `{'cookie': '${REDACTED}'}`)
  assert.equal(redactText('Authorization: Bearer abc.def'), `Authorization: Bearer ${REDACTED}`)
  assert.equal(redactText('authorization=plain'), `authorization=${REDACTED}`)
  assert.equal(redactText('{"authorization":"Bearer abc"}'), `{"authorization":"${REDACTED}"}`)
  assert.equal(redactText('refresh_token=xyz'), `refresh_token=${REDACTED}`)
  assert.equal(redactText('client_secret: s3cr3t'), `client_secret: ${REDACTED}`)
  assert.equal(redactText('http://h/?code=abc&key=k1'), `http://h/?code=${REDACTED}&key=${REDACTED}`)
})

test('redactText covers the header and key spellings of a credential', () => {
  assert.equal(redactText('OPENAI_API_KEY=sk-live'), `OPENAI_API_KEY=${REDACTED}`)
  assert.equal(redactText('X-API-Key: sk-live'), `X-API-Key: ${REDACTED}`)
  assert.equal(redactText('{"apiKey":"sk-live-123"}'), `{"apiKey":"${REDACTED}"}`)
  assert.equal(redactText('signing_key: abc123'), `signing_key: ${REDACTED}`)
  assert.equal(redactText('Set-Cookie: "session=abc"'), `Set-Cookie: "${REDACTED}"`)
  assert.equal(redactText('Authorization: Token sk-live'), `Authorization: Token ${REDACTED}`)
  assert.equal(redactText('authorization: digest abc123'), `authorization: digest ${REDACTED}`)
})

test('redactText leaves a redacted value and an unrelated key alone', () => {
  assert.equal(redactText(`token=${REDACTED}`), `token=${REDACTED}`)
  assert.equal(redactText(`Authorization: Bearer ${REDACTED}`), `Authorization: Bearer ${REDACTED}`)
  assert.equal(redactText('LAB_MOCK_KEY=lab-mock-key'), 'LAB_MOCK_KEY=lab-mock-key')
  assert.equal(redactText('exit code: 1'), 'exit code: 1')
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

test('redactMessage cleans the text a report field carries', () => {
  assert.equal(redactMessage(new Error('dsh web: http://h/?token=abc timed out')), `dsh web: http://h/?token=${REDACTED} timed out`)
  assert.equal(redactMessage('GET /?token=abc'), `GET /?token=${REDACTED}`)
  assert.equal(redactMessage(undefined), undefined)
  assert.equal(redactMessage(null), undefined)
})

test('redactState terminates on the cyclic handles of a live web session', () => {
  class Page {}
  const context = { pages: [] }
  const page = new Page()
  page.context = context
  context.pages.push(page)
  const state = redactState({
    checks: [{ name: 'web', status: 'ok', detail: 'listening' }],
    web: {
      page,
      context,
      browser: { contexts: () => [context] },
      url: 'http://127.0.0.1:3210/?token=abc',
      base: 'http://127.0.0.1:3210',
      cookie: 'session=abc',
      logPath: '/runs/1/web.log',
      process: { pid: 42, stop() {} },
    },
  })
  assert.deepEqual(Object.keys(state.web).sort(), ['base', 'logPath'])
  assert.equal(state.web.base, 'http://127.0.0.1:3210')
  assert.equal(state.web.logPath, '/runs/1/web.log')
  assert.equal(JSON.stringify(state).includes('session=abc'), false)
})

test('redactState stays finite on a self-referencing record', () => {
  const record = { name: 'loop' }
  record.self = record
  const state = redactState({ checks: [record] })
  assert.equal(state.checks[0].name, 'loop')
  assert.equal(state.checks[0].self, REDACTED)
})
