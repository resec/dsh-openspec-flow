import test from 'node:test'
import assert from 'node:assert/strict'
import { instanceState, main, parseOptions } from '../scripts/lab/cli.mjs'
import { redactState } from '../scripts/lab/core/redact.mjs'

const labContext = {
  run: { dir: '/runs/1', home: '/runs/1/home', agentsHome: '/runs/1/agents' },
  dsh: { bin: '/cache/dsh/bin/dsh' },
  env: { PLAYWRIGHT_BROWSERS_PATH: '/pw' },
}
const tarball = { tarball: '/tmp/fixture.tgz', name: 'fixture', version: '0.0.0', sha512: 'fixture', dirty: undefined, head: undefined }
const openWeb = {
  url: 'http://127.0.0.1:3210/?token=startup-abc',
  base: 'http://127.0.0.1:3210',
  logPath: '/runs/1/artifacts/web.log',
  cookie: 'session=abc',
  process: { child: { pid: 4242 } },
}

test('the web instance state keeps the origin and log path, not the startup URL', () => {
  const state = instanceState({ name: 'poc', mode: 'web', lab: labContext, tarball, web: openWeb })
  assert.deepEqual(state.web, { base: 'http://127.0.0.1:3210', logPath: '/runs/1/artifacts/web.log' })
  assert.equal(state.pid, 4242)
  assert.equal('url' in state, false)
  const persisted = `${JSON.stringify(redactState(state), null, 2)}\n`
  assert.equal(persisted.includes('startup-abc'), false)
  assert.equal(persisted.includes('session=abc'), false)
  assert.match(persisted, /"base": "http:\/\/127\.0\.0\.1:3210"/u)
  assert.match(persisted, /"logPath": "\/runs\/1\/artifacts\/web\.log"/u)
  assert.equal(state.env.LAB_MOCK_KEY, 'lab-mock-key', 'the mock fixture key still reaches exec')
})

test('a headless instance state carries no web entry and no pid', () => {
  const state = instanceState({ name: 'poc', mode: 'headless', lab: labContext, tarball })
  assert.equal('web' in state, false)
  assert.equal('pid' in state, false)
  assert.equal(state.runDir, '/runs/1')
})

test('the CLI parser keeps flags and positional arguments separate', () => {
  const { flags, positional } = parseOptions(['--name', 'poc', '--mock-only', '--', 'a task'])
  assert.equal(flags.name, 'poc')
  assert.equal(flags['mock-only'], true)
  assert.deepEqual(positional, ['a task'])
})

test('the CLI help exits successfully', async () => {
  assert.equal(await main(['--help']), 0)
})

test('an unknown command is rejected', async () => {
  await assert.rejects(main(['nope']), /unknown command/)
})
