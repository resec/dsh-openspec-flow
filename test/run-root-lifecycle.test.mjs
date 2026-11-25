import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCRIPT = join(ROOT, 'scripts', 'affected-tests.mjs')
const RUNNER = join(ROOT, 'scripts', 'run-tests.mjs')

/** Longest entrypoint stderr excerpt an assertion message carries. */
const STDERR_LIMIT = 500

/** Longest wait for a child's stderr to close before the capture is read. */
const STDERR_DRAIN_MS = 500

/** Create a scratch probe directory that the test removes afterwards. */
function scratch(t) {
  const directory = mkdtempSync(join(tmpdir(), 'run-root-lifecycle-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

/** Build an environment that no longer carries the outer test runner's context. */
function childEnv(overrides) {
  const env = { ...process.env, ...overrides }
  delete env.NODE_TEST_CONTEXT
  delete env.COVERAGE
  if (!('DSH_TEST_KEEP_TMP' in overrides)) delete env.DSH_TEST_KEEP_TMP
  return env
}

/** Run the plain entrypoint with a name filter and resolve with its status. */
function runRunner(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [RUNNER, ...args], {
      cwd: ROOT,
      env: childEnv(env),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.once('error', (error) => resolve({ code: -1, stderr: String(error) }))
    child.once('exit', (code) => resolve({ code: code ?? 1, stderr }))
  })
}

/** Run the scoped entrypoint and resolve with its exit status and stderr. */
function runScoped(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      cwd: ROOT,
      env: childEnv(env),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.once('error', (error) => resolve({ code: -1, stderr: String(error) }))
    child.once('exit', (code) => resolve({ code: code ?? 1, stderr }))
  })
}

/** Render a child's captured stderr for an assertion message. */
function stderrNote(text) {
  const captured = text.trim()
  if (captured === '') return 'entrypoint stderr: <empty>'
  return `entrypoint stderr: ${captured.slice(-STDERR_LIMIT)}`
}

/** Resolve when the child's stderr closes, or after the bound, whichever comes first. */
function stderrClosed(child, timeoutMs = STDERR_DRAIN_MS) {
  const stream = child.stderr
  if (stream === null || stream === undefined || stream.closed === true) return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      stream.removeListener('close', finish)
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    stream.once('close', finish)
  })
}

test('a passing scoped run removes its run root', async (t) => {
  const probe = scratch(t)
  const result = await runScoped(['--run', 'test/temp.test.mjs'], { TMPDIR: probe })
  assert.equal(result.code, 0)
  assert.deepEqual(readdirSync(probe), [])
})

test('a kept scoped run leaves one root and reports its path', async (t) => {
  const probe = scratch(t)
  const result = await runScoped(['--run', 'test/temp.test.mjs'], { TMPDIR: probe, DSH_TEST_KEEP_TMP: '1' })
  assert.equal(result.code, 0)
  const entries = readdirSync(probe)
  assert.equal(entries.length, 1)
  assert.match(entries[0], /^openspec-flow-run-/)
  assert.ok(result.stderr.includes(join(probe, entries[0])))
  rmSync(join(probe, entries[0]), { recursive: true, force: true })
})

test('listing creates no run root', async (t) => {
  const probe = scratch(t)
  const result = await runScoped(['--list', 'lib/review/brief.js'], { TMPDIR: probe })
  assert.equal(result.code, 0)
  assert.deepEqual(readdirSync(probe), [])
})

test('a scoped run interrupted by SIGTERM removes its root and exits 143', async (t) => {
  const probe = scratch(t)
  const child = spawn(process.execPath, [SCRIPT, '--run', 'test/e2e.test.mjs'], {
    cwd: ROOT,
    env: childEnv({ TMPDIR: probe }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let childStderr = ''
  child.stderr.on('data', (chunk) => { childStderr += chunk })
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)))
  const timer = setTimeout(() => child.kill('SIGTERM'), 1500)
  try {
    const code = await exited
    await stderrClosed(child)
    assert.equal(code, 143, stderrNote(childStderr))
    assert.deepEqual(readdirSync(probe), [], stderrNote(childStderr))
  } finally {
    clearTimeout(timer)
  }
})

test('a passing plain run removes its run root', async (t) => {
  const probe = scratch(t)
  const result = await runRunner(['plugin', '--', '--test-name-pattern=a registered root is created'], { TMPDIR: probe })
  assert.equal(result.code, 0)
  assert.deepEqual(readdirSync(probe), [])
})

test('a failing plain run removes its run root', async (t) => {
  const probe = scratch(t)
  const result = await runRunner(['plugin', '--', '--bogus-test-flag'], { TMPDIR: probe })
  assert.notEqual(result.code, 0)
  assert.deepEqual(readdirSync(probe), [])
})

test('a kept plain run leaves one root and reports its path', async (t) => {
  const probe = scratch(t)
  const result = await runRunner(['plugin', '--', '--test-name-pattern=a registered root is created'], {
    TMPDIR: probe,
    DSH_TEST_KEEP_TMP: '1',
  })
  assert.equal(result.code, 0)
  const entries = readdirSync(probe)
  assert.equal(entries.length, 1)
  assert.match(entries[0], /^openspec-flow-run-/)
  assert.ok(result.stderr.includes(join(probe, entries[0])))
  rmSync(join(probe, entries[0]), { recursive: true, force: true })
})

test('a plain run interrupted by SIGTERM removes its root and exits 143', async (t) => {
  const probe = scratch(t)
  const child = spawn(process.execPath, [RUNNER, 'plugin', '--', '--test-name-pattern=runs init, plan, apply and archive'], {
    cwd: ROOT,
    env: childEnv({ TMPDIR: probe }),
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let childStderr = ''
  child.stderr.on('data', (chunk) => { childStderr += chunk })
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)))
  const timer = setTimeout(() => child.kill('SIGTERM'), 1500)
  try {
    const code = await exited
    await stderrClosed(child)
    assert.equal(code, 143, stderrNote(childStderr))
    assert.deepEqual(readdirSync(probe), [], stderrNote(childStderr))
  } finally {
    clearTimeout(timer)
  }
})

test('a held stderr pipe yields its capture after the bound', async () => {
  const stream = new PassThrough()
  let captured = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => { captured += chunk })
  stream.write('test entrypoint: cannot remove the run root at /tmp/probe\n')
  const started = performance.now()
  await stderrClosed({ stderr: stream }, 50)
  assert.ok(performance.now() - started >= 45, 'the drain waited for the bound')
  assert.equal(stderrNote(captured), 'entrypoint stderr: test entrypoint: cannot remove the run root at /tmp/probe')
})

test('an empty capture renders the empty marker', () => {
  assert.equal(stderrNote(''), 'entrypoint stderr: <empty>')
  assert.equal(stderrNote(' \n'), 'entrypoint stderr: <empty>')
})

test('an over-long capture keeps the last 500 characters', () => {
  const line = 'test entrypoint: cannot remove the run root at /tmp/probe'
  const rendered = stderrNote(`${'x'.repeat(600)}${line}`)
  assert.equal(rendered.length, 'entrypoint stderr: '.length + 500)
  assert.ok(rendered.endsWith(line), 'the excerpt keeps the cleanup line')
})
