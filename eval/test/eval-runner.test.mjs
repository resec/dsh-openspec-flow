import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { roundArgs, runRound } from '../lib/runner.mjs'

const FAKE = `#!/usr/bin/env node
const args = process.argv.slice(2)
const at = args.indexOf('--session-id')
const sessionId = at >= 0 ? args[at + 1] : 'session-fake-1'
let task = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { task += chunk })
process.stdin.on('end', () => {
  if (process.env.FAKE_MODE === 'hang') {
    setInterval(() => {}, 1000)
    return
  }
  if (process.env.FAKE_MODE === 'fail') {
    process.stderr.write('fake failure\\n')
    process.exit(1)
  }
  process.stdout.write(JSON.stringify({ type: 'session', sessionId }) + '\\n')
  process.stdout.write(JSON.stringify({ type: 'status', phase: 'turn_start', turn: 1 }) + '\\n')
  process.stdout.write(JSON.stringify({ type: 'final', sessionId, reason: { kind: 'completed' }, text: task }) + '\\n')
})
`

function fakeDsh(t, mode = 'ok') {
  const dir = mkdtempSync(join(tmpdir(), 'eval-runner-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const bin = join(dir, 'fake-dsh.mjs')
  writeFileSync(bin, FAKE)
  chmodSync(bin, 0o755)
  return { dir, bin, mode }
}

test('builds the headless argument vector', () => {
  assert.deepEqual(
    roundArgs({
      patches: ['/tmp/a.yml', '/tmp/b.yml'],
      sessionId: 'session-1',
      permissionMode: 'workspace-write',
      approvalPolicy: 'never',
    }),
    [
      '--profile',
      'headless',
      '--patch',
      '/tmp/a.yml',
      '--patch',
      '/tmp/b.yml',
      '--session-id',
      'session-1',
      '--permission-mode',
      'workspace-write',
      '--approval-policy',
      'never',
      '--json',
      '-',
    ],
  )
})

test('runs two rounds and resumes the first session', async (t) => {
  const fake = fakeDsh(t)
  const outDir = join(fake.dir, 'out')
  const env = { FAKE_MODE: 'ok' }

  const first = await runRound({
    cwd: fake.dir,
    task: 'first task',
    outDir,
    index: 0,
    env,
    dshBin: fake.bin,
  })
  assert.equal(first.exitCode, 0)
  assert.equal(first.timedOut, false)
  assert.equal(first.sessionId, 'session-fake-1')
  assert.equal(first.final.text, 'first task')

  const second = await runRound({
    cwd: fake.dir,
    task: 'second task',
    sessionId: first.sessionId,
    outDir,
    index: 1,
    env,
    dshBin: fake.bin,
  })
  assert.equal(second.sessionId, 'session-fake-1')
  assert.equal(second.final.text, 'second task')
  assert.ok(second.args.includes('--session-id'))
})

test('kills a hanging round and records the timeout', async (t) => {
  const fake = fakeDsh(t)
  const result = await runRound({
    cwd: fake.dir,
    task: 'hang',
    outDir: join(fake.dir, 'out'),
    timeoutMs: 100,
    killGraceMs: 50,
    env: { FAKE_MODE: 'hang' },
    dshBin: fake.bin,
  })

  assert.equal(result.timedOut, true)
  assert.ok(result.durationMs < 5000)
})

test('captures a failing exit and stderr', async (t) => {
  const fake = fakeDsh(t)
  const result = await runRound({
    cwd: fake.dir,
    task: 'fail',
    outDir: join(fake.dir, 'out'),
    env: { FAKE_MODE: 'fail' },
    dshBin: fake.bin,
  })

  assert.equal(result.exitCode, 1)
  assert.match(result.stderr, /fake failure/u)
})
